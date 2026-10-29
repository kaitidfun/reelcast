import { randomUUID } from 'crypto';
import { test as base, expect } from '@playwright/test';
import { connectDB, disconnectDB, deleteUserByEmail, findUserByEmail, query } from './db-helper';
import { authToken, createCampaignAndProduct, registerAndLogin, systemUser } from './system-fixture';

export const backend = process.env.BACKEND_URL ?? 'http://localhost:8000';
export const destination = 'https://example.com/?aff=001&x=%2F';

// Real authenticated API + PostgreSQL fixtures; no tracking API interception.
export const test = base.extend<{ tracking: {
  token: string; owner: string; account: string; product: string;
  seed: (views?: number[], clicksA?: number, clicksB?: number, partial?: boolean) => Promise<string[]>;
} }>({
  tracking: async ({ page, request }, use, testInfo) => {
    await connectDB();
    const user = systemUser(testInfo, 'stc-f5');
    try {
      await registerAndLogin(page, request, user);
      const owner = (await findUserByEmail(user.email))!.user_id;
      const token = await authToken(page);
      const { product } = await createCampaignAndProduct(page, request, { campaign: 'F5 campaign', product: '001สินค้า' });
      await query('UPDATE products SET affiliate_link=$2 WHERE product_id=$1', [product.product_id, destination]);
      const account = randomUUID();
      // Reporting fixtures never send this placeholder credential to a provider.
      await query('INSERT INTO social_accounts(account_id,user_id,platform_name,access_token) VALUES($1,$2,$3,$4)',
        [account, owner, 'youtube', 'reporting-fixture-only']);
      await use({ token, owner, account, product: product.product_id,
        seed: async (views = [10], clicksA = 3, clicksB = 6, partial = false) => {
          const ids: string[] = [];
          for (const [i, value] of views.entries()) {
            const reel = randomUUID(), distribution = randomUUID(), link = randomUUID();
            await query("INSERT INTO reels(reel_id,user_id,product_id,prompt_text,name,status) VALUES($1,$2,$3,$4::text,$4::text,'Completed')",
              [reel, owner, product.product_id, i === 0 ? '=BAD()' : `F5 Reel ${i}`]);
            await query("INSERT INTO distributions(distribution_id,reel_id,account_id,status,platform_post_id) VALUES($1,$2,$3,'Published',$4)",
              [distribution, reel, account, `f5-${distribution}`]);
            await query(`INSERT INTO tracking_observations(observation_id,user_id,account_id,distribution_id,platform,external_ref,
              observed_date,observed_at,views,likes,comments,shares) VALUES($1,$2,$3,$4,'youtube',$5,'2026-10-20','2026-10-20T10:00:00Z',$6,4,NULL,NULL)`,
              [randomUUID(), owner, account, distribution, `youtube:f5-${distribution}`, value]);
            await query(`INSERT INTO tracking_links(link_id,user_id,distribution_id,code,destination,created_at) VALUES($1,$2,$3,$4,$5,$6)`,
              [link, owner, distribution, randomUUID(), destination, partial ? '2026-10-15T00:00:00Z' : '2026-10-01T00:00:00Z']);
            if (i === 0) {
              for (const [date, count] of [['2026-10-16T10:00:00Z', clicksA], ['2026-10-21T10:00:00Z', clicksB]] as const) {
                for (let n = 0; n < count; n++) await query('INSERT INTO tracking_clicks(click_id,link_id,clicked_at) VALUES($1,$2,$3)', [randomUUID(), link, date]);
              }
            }
            ids.push(distribution);
          }
          return ids;
        },
      });
    } finally {
      await deleteUserByEmail(user.email);
      await disconnectDB();
    }
  },
});
export { expect };
