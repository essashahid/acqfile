import { test, expect } from "@playwright/test";
import { login } from "./helpers";
test('rule viewer compares packs, shows sources and applies Sample Lender A parameters',async({page})=>{
 await login(page);await page.goto('/rulepacks');await expect(page.getByRole('heading',{name:'Rule packs',exact:true})).toBeVisible();
 await expect(page.locator('[data-rule-id="TXN-09"]')).toContainText('Unverified');
 await page.locator('select[name="overlay"]').selectOption('sample-lender-a');await page.getByRole('button',{name:'View comparison'}).click();
 await expect(page.getByRole('region',{name:'Pack parameters'})).toContainText('sample-lender-a');
 await expect(page.locator('[data-rule-id="TXN-10a"]')).toContainText('Non-compete');await expect(page.locator('[data-rule-id="TGT-11"]')).toContainText('Add-back');
 await expect(page.locator('[data-rule-id="TXN-10b"]')).toContainText('Optional · not required');
 await expect(page.getByRole('region',{name:'Pack parameters'})).toContainText('SLA_{party}');
 const change=page.getByRole('region',{name:'Pack comparison'}).locator('details').filter({has:page.locator('summary').filter({hasText:'TGT-03'})});
 await change.locator('summary').click();await expect(change).toContainText('60');await expect(change).toContainText('120');
 await page.locator('select[name="pack"]').selectOption('sop-50-10-8');await page.locator('select[name="overlay"]').selectOption('');await page.getByRole('button',{name:'View comparison'}).click();
 await expect(page.locator('[data-rule-id="TXN-09"]')).toHaveCount(0);await expect(page.getByRole('region',{name:'Pack comparison'})).toContainText('No rule differences.');
});
