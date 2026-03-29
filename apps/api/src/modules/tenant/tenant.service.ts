import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { prisma } from '../../lib/prisma';
import { encrypt, decrypt, decryptNullable } from '../../lib/crypto';

function keyHint(key: string): string {
  if (key.length <= 6) return key;
  return `${key.slice(0, 3)}---${key.slice(-3)}`;
}
import { ConflictError, NotFoundError } from '../../lib/errors';
import type { TenantPlan } from '@kassomat/types';

export interface RegisterTenantInput {
  tenantName: string;
  ownerEmail: string;
  ownerPassword: string;
  ownerName: string;
  vatNumber?: string | null;
}

export interface UpdateTenantInput {
  name?: string;
  address?: string | null;
  city?: string | null;
  receiptFooter?: string | null;
  printerIp?: string | null;
  printerPort?: number | null;
  vatNumber?: string | null;
  rksvEnabled?: boolean;
  atrust?: {
    certificateSerial?: string;
    apiKey: string;
    environment: 'test' | 'production';
  } | null;
  lieferando?: {
    restaurantId: string;
    apiKey?: string;
    webhookSecret?: string;
    isActive: boolean;
  } | null;
  wix?: {
    siteId: string;
    apiKey?: string;
    webhookSecret?: string;
    isActive: boolean;
    defaultDeliveryPayment: 'cash' | 'online';
  } | null;
  mypos?: {
    storeId: string;
    apiKey?: string;
    secretKey?: string;
    terminalSerial?: string | null;
  } | null;
  fiskaltrust?: {
    cashboxId: string;
    accessToken?: string;
    environment: 'sandbox' | 'production';
  } | null;
}

export class TenantService {
  /** Neuen Tenant + Owner anlegen, 14-Tage Trial starten */
  async register(input: RegisterTenantInput) {
    const email = input.ownerEmail.toLowerCase();

    // E-Mail bereits registriert?
    const existing = await prisma.user.findFirst({ where: { email } });
    if (existing) throw new ConflictError('Diese E-Mail-Adresse ist bereits registriert');

    const slug = this.generateSlug(input.tenantName);
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const passwordHash = await argon2.hash(input.ownerPassword);

    const tenant = await prisma.tenant.create({
      data: {
        name: input.tenantName,
        slug: await this.uniqueSlug(slug),
        status: 'trial',
        trialEndsAt,
        vatNumber: input.vatNumber ?? null,
        users: {
          create: {
            email,
            passwordHash,
            name: input.ownerName,
            role: 'owner',
          },
        },
      },
      include: { users: { where: { role: 'owner' } } },
    });

    const owner = tenant.users[0];
    if (!owner) throw new Error('Owner creation failed');

    return { tenant, owner };
  }

  /** Tenant by ID laden (mit entschlüsselten API-Keys für interne Nutzung) */
  async getById(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundError('Tenant');
    return this.toPublicTenant(tenant);
  }

  /** Tenant-Einstellungen aktualisieren */
  async update(tenantId: string, input: UpdateTenantInput) {
    const updateData: Record<string, unknown> = {};
    // Fetch existing tenant only when needed to preserve webhookSecrets
    let existing: Awaited<ReturnType<typeof prisma.tenant.findUnique>> | null = null;
    const needExisting = (input.lieferando && !input.lieferando.webhookSecret) ||
                         (input.wix && !input.wix.webhookSecret);
    if (needExisting) {
      existing = await prisma.tenant.findUnique({ where: { id: tenantId } });
    }

    if (input.name !== undefined) updateData['name'] = input.name;
    if (input.address !== undefined) updateData['address'] = input.address;
    if (input.city !== undefined) updateData['city'] = input.city;
    if (input.receiptFooter !== undefined) updateData['receiptFooter'] = input.receiptFooter;
    if (input.printerIp !== undefined) updateData['printerIp'] = input.printerIp;
    if (input.printerPort !== undefined) updateData['printerPort'] = input.printerPort;
    if (input.vatNumber !== undefined) updateData['vatNumber'] = input.vatNumber;
    if (input.rksvEnabled !== undefined) updateData['rksvEnabled'] = input.rksvEnabled;

    if (input.atrust !== undefined) {
      if (input.atrust === null) {
        updateData['atrustCertificateSerial'] = null;
        updateData['atrustApiKey_encrypted'] = null;
      } else {
        if (input.atrust.certificateSerial) {
          updateData['atrustCertificateSerial'] = input.atrust.certificateSerial;
        }
        updateData['atrustApiKey_encrypted'] = encrypt(input.atrust.apiKey);
        updateData['atrustApiKeyHint'] = keyHint(input.atrust.apiKey);
        updateData['atrustEnvironment'] = input.atrust.environment;
      }
    }

    if (input.lieferando !== undefined) {
      if (input.lieferando === null) {
        updateData['lieferandoRestaurantId'] = null;
        updateData['lieferandoApiKey_encrypted'] = null;
        updateData['lieferandoWebhookSecret'] = null;
        updateData['lieferandoIsActive'] = false;
      } else {
        updateData['lieferandoRestaurantId'] = input.lieferando.restaurantId;
        if (input.lieferando.apiKey) {
          updateData['lieferandoApiKey_encrypted'] = encrypt(input.lieferando.apiKey);
          updateData['lieferandoApiKeyHint'] = keyHint(input.lieferando.apiKey);
        }
        updateData['lieferandoWebhookSecret'] = input.lieferando.webhookSecret ||
          existing?.lieferandoWebhookSecret ||
          randomBytes(32).toString('hex');
        updateData['lieferandoIsActive'] = input.lieferando.isActive;
      }
    }

    if (input.wix !== undefined) {
      if (input.wix === null) {
        updateData['wixSiteId'] = null;
        updateData['wixApiKey_encrypted'] = null;
        updateData['wixWebhookSecret'] = null;
        updateData['wixIsActive'] = false;
      } else {
        updateData['wixSiteId'] = input.wix.siteId;
        if (input.wix.apiKey) {
          updateData['wixApiKey_encrypted'] = encrypt(input.wix.apiKey);
          updateData['wixApiKeyHint'] = keyHint(input.wix.apiKey);
        }
        updateData['wixWebhookSecret'] = input.wix.webhookSecret ||
          existing?.wixWebhookSecret ||
          randomBytes(32).toString('hex');
        updateData['wixIsActive'] = input.wix.isActive;
        updateData['wixDefaultDeliveryPayment'] = input.wix.defaultDeliveryPayment;
      }
    }

    if (input.mypos !== undefined) {
      if (input.mypos === null) {
        updateData['myposStoreId'] = null;
        updateData['myposApiKey_encrypted'] = null;
        updateData['myposSecretKey_encrypted'] = null;
        updateData['myposTerminalSerial'] = null;
      } else {
        updateData['myposStoreId'] = input.mypos.storeId;
        // Only re-encrypt keys if a new value was provided (non-empty string)
        // This allows updating storeId/terminal without re-entering credentials
        if (input.mypos.apiKey) {
          updateData['myposApiKey_encrypted'] = encrypt(input.mypos.apiKey);
          updateData['myposApiKeyHint'] = keyHint(input.mypos.apiKey);
        }
        if (input.mypos.secretKey) {
          updateData['myposSecretKey_encrypted'] = encrypt(input.mypos.secretKey);
        }
        updateData['myposTerminalSerial'] = input.mypos.terminalSerial ?? null;
      }
    }

    if (input.fiskaltrust !== undefined) {
      if (input.fiskaltrust === null) {
        updateData['fiskaltrustCashboxId'] = null;
        updateData['fiskaltrustAccessToken_encrypted'] = null;
        updateData['fiskaltrustAccessTokenHint'] = null;
      } else {
        updateData['fiskaltrustCashboxId'] = input.fiskaltrust.cashboxId;
        if (input.fiskaltrust.accessToken) {
          updateData['fiskaltrustAccessToken_encrypted'] = encrypt(input.fiskaltrust.accessToken);
          updateData['fiskaltrustAccessTokenHint'] = keyHint(input.fiskaltrust.accessToken);
        }
        updateData['fiskaltrustEnvironment'] = input.fiskaltrust.environment;
      }
    }

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: updateData,
    });

    return this.toPublicTenant(updated);
  }

  /** Konvertiert DB-Tenant zu öffentlichem Tenant-Objekt (ohne API Keys im Klartext) */
  private toPublicTenant(tenant: Awaited<ReturnType<typeof prisma.tenant.findUniqueOrThrow>>) {
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan as TenantPlan,
      status: tenant.status,
      trialEndsAt: tenant.trialEndsAt,
      createdAt: tenant.createdAt,
      settings: {
        currency: tenant.currency,
        timezone: tenant.timezone,
        address: tenant.address ?? null,
        city: tenant.city ?? null,
        vatNumber: tenant.vatNumber,
        receiptFooter: tenant.receiptFooter,
        printerIp: tenant.printerIp,
        printerPort: tenant.printerPort,
        rksvEnabled: tenant.rksvEnabled,
        atrust: tenant.atrustCertificateSerial
          ? {
              certificateSerial: tenant.atrustCertificateSerial,
              configured: true,
              apiKeyHint: tenant.atrustApiKeyHint ?? null,
              environment: tenant.atrustEnvironment,
            }
          : null,
        lieferando: tenant.lieferandoRestaurantId
          ? {
              restaurantId: tenant.lieferandoRestaurantId,
              configured: true,
              apiKeyHint: tenant.lieferandoApiKeyHint ?? null,
              isActive: tenant.lieferandoIsActive,
            }
          : null,
        wix: tenant.wixSiteId
          ? {
              siteId: tenant.wixSiteId,
              configured: true,
              apiKeyHint: tenant.wixApiKeyHint ?? null,
              isActive: tenant.wixIsActive,
              defaultDeliveryPayment: tenant.wixDefaultDeliveryPayment,
            }
          : null,
        mypos: tenant.myposStoreId
          ? {
              storeId: tenant.myposStoreId,
              configured: !!(tenant.myposApiKey_encrypted && tenant.myposSecretKey_encrypted),
              apiKeyHint: tenant.myposApiKeyHint ?? null,
              terminalSerial: tenant.myposTerminalSerial ?? null,
            }
          : null,
        fiskaltrust: tenant.fiskaltrustCashboxId
          ? {
              cashboxId: tenant.fiskaltrustCashboxId,
              configured: !!tenant.fiskaltrustAccessToken_encrypted,
              accessTokenHint: tenant.fiskaltrustAccessTokenHint ?? null,
              environment: (tenant.fiskaltrustEnvironment ?? 'sandbox') as 'sandbox' | 'production',
            }
          : null,
      },
    };
  }

  /** Verschlüsselte API Keys für interne Service-Nutzung (nie an Client senden!) */
  async getDecryptedConfig(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundError('Tenant');

    return {
      atrust: tenant.atrustCertificateSerial && tenant.atrustApiKey_encrypted
        ? {
            certificateSerial: tenant.atrustCertificateSerial,
            apiKey: decrypt(tenant.atrustApiKey_encrypted),
            environment: tenant.atrustEnvironment,
          }
        : null,
      lieferando: tenant.lieferandoRestaurantId && tenant.lieferandoApiKey_encrypted
        ? {
            restaurantId: tenant.lieferandoRestaurantId,
            apiKey: decrypt(tenant.lieferandoApiKey_encrypted),
            webhookSecret: tenant.lieferandoWebhookSecret ?? '',
            isActive: tenant.lieferandoIsActive,
          }
        : null,
      wix: tenant.wixSiteId && tenant.wixApiKey_encrypted
        ? {
            siteId: tenant.wixSiteId,
            apiKey: decrypt(tenant.wixApiKey_encrypted),
            webhookSecret: tenant.wixWebhookSecret ?? '',
            isActive: tenant.wixIsActive,
            defaultDeliveryPayment: tenant.wixDefaultDeliveryPayment,
          }
        : null,
      mypos: tenant.myposStoreId && tenant.myposApiKey_encrypted && tenant.myposSecretKey_encrypted
        ? {
            storeId: tenant.myposStoreId,
            apiKey: decrypt(tenant.myposApiKey_encrypted),
            secretKey: decrypt(tenant.myposSecretKey_encrypted),
            terminalSerial: tenant.myposTerminalSerial ?? null,
          }
        : null,
    };
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private async uniqueSlug(base: string): Promise<string> {
    let slug = base;
    let counter = 1;
    while (await prisma.tenant.findUnique({ where: { slug } })) {
      slug = `${base}-${counter++}`;
    }
    return slug;
  }
}
