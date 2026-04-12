import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  PersonelOlusturGirdi,
  PersonelGuncelleGirdi,
  PersonelOdemeOlusturGirdi,
} from '@kuvvem/contracts';
import { TenantClient } from '@kuvvem/database';

@Injectable()
export class PersonelService {
  private readonly personelSecim = {
    id: true,
    publicId: true,
    adiSoyadi: true,
    tc: true,
    unvan: true,
    cep: true,
    mailAdresi: true,
    iseGiris: true,
    istenCikis: true,
    maas: true,
    maasGunu: true,
    iban: true,
    aktifMi: true,
    olusturmaTarihi: true,
    guncellemeTarihi: true,
    magazalar: {
      select: {
        magaza: { select: { id: true, kod: true, ad: true } },
      },
    },
  } as const;

  async listele(prisma: TenantClient, durum?: string) {
    const where: Record<string, unknown> = {};
    if (durum === 'aktif') where.aktifMi = true;
    else if (durum === 'pasif') where.aktifMi = false;

    return prisma.personel.findMany({
      where,
      orderBy: { olusturmaTarihi: 'desc' },
      select: this.personelSecim,
    });
  }

  async detay(prisma: TenantClient, id: number) {
    const personel = await prisma.personel.findFirst({
      where: { id: BigInt(id) },
      select: {
        ...this.personelSecim,
        odemeler: {
          orderBy: { tarih: 'desc' },
          select: {
            id: true,
            publicId: true,
            tip: true,
            tutar: true,
            aciklama: true,
            tarih: true,
            olusturmaTarihi: true,
          },
        },
      },
    });

    if (!personel) {
      throw new NotFoundException({
        kod: 'PERSONEL_BULUNAMADI',
        mesaj: `Personel bulunamadi: ${id}`,
      });
    }

    // Bakiye hesapla: hakedis - (odeme + mahsup)
    const bakiye = this.bakiyeHesapla(personel.odemeler);

    return { ...personel, bakiye };
  }

  async olustur(
    prisma: TenantClient,
    girdi: PersonelOlusturGirdi,
    olusturanId: bigint,
  ) {
    const personel = await prisma.personel.create({
      data: {
        adiSoyadi: girdi.adiSoyadi,
        tc: girdi.tc ?? null,
        unvan: girdi.unvan ?? null,
        cep: girdi.cep ?? null,
        mailAdresi: girdi.mailAdresi ?? null,
        iseGiris: girdi.iseGiris ? new Date(girdi.iseGiris) : null,
        istenCikis: girdi.istenCikis ? new Date(girdi.istenCikis) : null,
        maas: girdi.maas ?? 0,
        maasGunu: girdi.maasGunu ?? 1,
        iban: girdi.iban ?? null,
        olusturanKullaniciId: olusturanId,
      },
    });

    // Magaza atamalari
    if (girdi.magazaIdler && girdi.magazaIdler.length > 0) {
      await prisma.personelMagaza.createMany({
        data: girdi.magazaIdler.map((mId) => ({
          personelId: personel.id,
          magazaId: BigInt(mId),
        })),
        skipDuplicates: true,
      });
    }

    return prisma.personel.findUnique({
      where: { id: personel.id },
      select: this.personelSecim,
    });
  }

  async guncelle(
    prisma: TenantClient,
    id: number,
    girdi: PersonelGuncelleGirdi,
    guncelleyenId: bigint,
  ) {
    await this.varMi(prisma, id);
    const personelId = BigInt(id);

    const data: Record<string, unknown> = {
      guncelleyenKullaniciId: guncelleyenId,
    };
    if (girdi.adiSoyadi !== undefined) data.adiSoyadi = girdi.adiSoyadi;
    if (girdi.tc !== undefined) data.tc = girdi.tc ?? null;
    if (girdi.unvan !== undefined) data.unvan = girdi.unvan ?? null;
    if (girdi.cep !== undefined) data.cep = girdi.cep ?? null;
    if (girdi.mailAdresi !== undefined) data.mailAdresi = girdi.mailAdresi ?? null;
    if (girdi.iseGiris !== undefined) data.iseGiris = girdi.iseGiris ? new Date(girdi.iseGiris) : null;
    if (girdi.istenCikis !== undefined) data.istenCikis = girdi.istenCikis ? new Date(girdi.istenCikis) : null;
    if (girdi.maas !== undefined) data.maas = girdi.maas;
    if (girdi.maasGunu !== undefined) data.maasGunu = girdi.maasGunu;
    if (girdi.iban !== undefined) data.iban = girdi.iban ?? null;

    await prisma.personel.update({
      where: { id: personelId },
      data,
    });

    // Magaza atamalari guncelle
    if (girdi.magazaIdler !== undefined) {
      await prisma.personelMagaza.deleteMany({ where: { personelId } });
      if (girdi.magazaIdler.length > 0) {
        await prisma.personelMagaza.createMany({
          data: girdi.magazaIdler.map((mId) => ({
            personelId,
            magazaId: BigInt(mId),
          })),
          skipDuplicates: true,
        });
      }
    }

    return prisma.personel.findUnique({
      where: { id: personelId },
      select: this.personelSecim,
    });
  }

  async aktiflikToggle(prisma: TenantClient, id: number, guncelleyenId: bigint) {
    const p = await this.varMi(prisma, id);
    return prisma.personel.update({
      where: { id: BigInt(id) },
      data: {
        aktifMi: !p.aktifMi,
        guncelleyenKullaniciId: guncelleyenId,
      },
      select: this.personelSecim,
    });
  }

  async hareketler(prisma: TenantClient, id: number) {
    await this.varMi(prisma, id);
    return prisma.personelOdeme.findMany({
      where: { personelId: BigInt(id) },
      orderBy: { tarih: 'desc' },
      select: {
        id: true,
        publicId: true,
        tip: true,
        tutar: true,
        aciklama: true,
        tarih: true,
        olusturmaTarihi: true,
      },
    });
  }

  async hareketEkle(
    prisma: TenantClient,
    id: number,
    girdi: PersonelOdemeOlusturGirdi,
    olusturanId: bigint,
  ) {
    await this.varMi(prisma, id);
    return prisma.personelOdeme.create({
      data: {
        personelId: BigInt(id),
        tip: girdi.tip,
        tutar: girdi.tutar,
        aciklama: girdi.aciklama ?? null,
        tarih: new Date(girdi.tarih),
        olusturanKullaniciId: olusturanId,
      },
    });
  }

  // ─── Yardimci ───

  private async varMi(prisma: TenantClient, id: number) {
    const p = await prisma.personel.findFirst({
      where: { id: BigInt(id) },
    });
    if (!p) {
      throw new NotFoundException({
        kod: 'PERSONEL_BULUNAMADI',
        mesaj: `Personel bulunamadi: ${id}`,
      });
    }
    return p;
  }

  private bakiyeHesapla(
    odemeler: Array<{ tip: string; tutar: unknown }>,
  ): string {
    let hakedis = 0;
    let odeme = 0;

    for (const o of odemeler) {
      const tutar = Number(o.tutar);
      if (o.tip === 'hakedis') {
        hakedis += tutar;
      } else {
        // odeme ve mahsup toplam odeme olarak sayilir
        odeme += tutar;
      }
    }

    return (hakedis - odeme).toFixed(2);
  }
}
