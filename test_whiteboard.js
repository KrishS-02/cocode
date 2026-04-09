import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Go to login
    await page.goto('http://localhost:5174/login');
    await page.fill('input[type="email"]', 'john@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Wait for dashboard and click on "Playground" environment
    await page.waitForSelector('text=Playground', { timeout: 10000 });
    await page.click('text=Playground');

    // Click Whiteboard toggle
    await page.waitForSelector('text=Whiteboard', { timeout: 10000 });
    await page.click('text=Whiteboard');

    // Wait for canvas
    await page.waitForSelector('.konvajs-content');
    console.log("Canvas found. Drawing...");

    // Simulate drawing
    const canvas = await page.$('.konvajs-content');
    if (canvas) {
        const box = await canvas.boundingBox();
        if (box) {
            await page.mouse.move(box.x + 100, box.y + 100);
            await page.mouse.down();
            await page.mouse.move(box.x + 200, box.y + 200, { steps: 10 });
            await page.mouse.up();
        }
    }

    console.log("Drawing action complete. Waiting for sync observation...");
    await page.waitForTimeout(5000);

    await browser.close();
})();
