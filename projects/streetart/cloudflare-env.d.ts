declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ADMIN_BOOTSTRAP_HASH?: string;
    CABINET_ORIGIN?: string;
    YOOKASSA_SHOP_ID?: string;
    YOOKASSA_SECRET_KEY?: string;
    PAYMENT_MODE?: string;
  }
}
