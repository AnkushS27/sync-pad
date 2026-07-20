import { test, expect } from "@playwright/test";

test.describe("SyncPad E2E Collaboration & Convergence Tests", () => {
  test.describe.configure({ mode: "serial" });
  const timestamp = Date.now();
  const user1Email = `u1-${timestamp}@example.com`;
  const user2Email = `u2-${timestamp}@example.com`;
  const viewerEmail = `v1-${timestamp}@example.com`;
  const password = "password123";

  // Helper to register and log in a user
  async function registerAndLogin(page: any, name: string, email: string) {
    await page.goto("/register");
    await page.fill('input[placeholder="John Doe"]', name);
    await page.fill('input[placeholder="you@example.com"]', email);
    await page.fill('input[placeholder="••••••••"]', password);
    await page.click('button[type="submit"]');

    // Should redirect to login
    await page.waitForURL(/\/login/);
    await page.fill('input[placeholder="you@example.com"]', email);
    await page.fill('input[placeholder="••••••••"]', password);
    await page.click('button[type="submit"]');

    // Should redirect to documents dashboard
    await page.waitForURL(/\/documents/);
  }

  test("Register User 1, User 2, and Viewer", async ({ browser }) => {
    const page1 = await browser.newPage();
    const page2 = await browser.newPage();
    const page3 = await browser.newPage();

    await registerAndLogin(page1, "User One", user1Email);
    await registerAndLogin(page2, "User Two", user2Email);
    await registerAndLogin(page3, "Viewer One", viewerEmail);

    await page1.close();
    await page2.close();
    await page3.close();
  });

  test("Convergence, offline editing, viewer restrictions, and version restore E2E flows", async ({
    browser,
  }) => {
    // 1. Setup contexts
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const contextViewer = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    const pageViewer = await contextViewer.newPage();

    // Log in all pages
    await page1.goto("/login");
    await page1.fill('input[placeholder="you@example.com"]', user1Email);
    await page1.fill('input[placeholder="••••••••"]', password);
    await page1.click('button[type="submit"]');
    await page1.waitForURL(/\/documents/);

    await page2.goto("/login");
    await page2.fill('input[placeholder="you@example.com"]', user2Email);
    await page2.fill('input[placeholder="••••••••"]', password);
    await page2.click('button[type="submit"]');
    await page2.waitForURL(/\/documents/);

    await pageViewer.goto("/login");
    await pageViewer.fill('input[placeholder="you@example.com"]', viewerEmail);
    await pageViewer.fill('input[placeholder="••••••••"]', password);
    await pageViewer.click('button[type="submit"]');
    await pageViewer.waitForURL(/\/documents/);

    // 2. User 1 creates a document
    await page1.click('button:has-text("New Document")');
    const docTitle = `E2E Doc ${timestamp}`;
    await page1.fill('input[id="title"]', docTitle);
    await page1.click('button[type="submit"]:has-text("Create Document")');

    // Wait for the document card to appear in the list
    await page1.waitForSelector(`h3:has-text("${docTitle}")`);

    // 3. User 1 invites User 2 as EDITOR and Viewer as VIEWER
    // Open the dropdown menu for the card
    const card = page1.locator("div.group", { has: page1.locator("h3", { hasText: docTitle }) });
    await card.locator("button").first().click(); // Click three-dots trigger on card
    // Wait for the dropdown menu
    await page1.click("text=Manage Sharing");

    // Invite User 2 (Editor)
    await page1.fill('input[placeholder="collaborator@example.com"]', user2Email);
    await page1.click('button[role="combobox"]');
    await page1.click('div[role="option"]:has-text("Editor")');
    await page1.click('button[type="submit"]');
    await page1.waitForSelector(`p:has-text("${user2Email}")`);

    // Invite Viewer (Viewer)
    await page1.fill('input[placeholder="collaborator@example.com"]', viewerEmail);
    await page1.click('button[role="combobox"]');
    await page1.click('div[role="option"]:has-text("Viewer")');
    await page1.click('button[type="submit"]');
    await page1.waitForSelector(`p:has-text("${viewerEmail}")`);

    // Close share dialog
    await page1.keyboard.press("Escape");

    // 4. Open Document Editor for User 1
    await card.locator("button").first().click();
    await page1.click("text=Open Editor");
    await page1.waitForSelector(".ProseMirror");

    // Get the document ID from URL
    const editorUrl = page1.url();
    const docId = editorUrl.split("/").pop();

    // 5. Open Document Editor for User 2
    await page2.goto(`/documents/${docId}`);
    await page2.waitForSelector(".ProseMirror");

    // 6. Open Document Editor for Viewer
    await pageViewer.goto(`/documents/${docId}`);
    await pageViewer.waitForSelector(".ProseMirror");

    // 7. Verify Viewer read-only enforcement
    const isEditable = await pageViewer.locator(".ProseMirror").getAttribute("contenteditable");
    expect(isEditable).toBe("false");

    // Check that "Save Version" is hidden for viewer
    await expect(pageViewer.locator('button:has-text("Save Version")')).not.toBeVisible();

    // 8. Convergence & Offline Testing
    // Go offline for User 1
    await context1.setOffline(true);
    // User 1 edits document offline
    await page1.locator(".ProseMirror").focus();
    await page1.keyboard.type("User 1 offline edits. ");

    // User 2 (online) edits document
    await page2.locator(".ProseMirror").focus();
    await page2.keyboard.type("User 2 online edits. ");

    // Go offline for User 2
    await context2.setOffline(true);
    await page2.keyboard.type("User 2 offline edits. ");

    // Go online for both
    await context1.setOffline(false);
    await context2.setOffline(false);

    // Reload pages to trigger immediate reconnect and load offline edits from IndexedDB
    await page1.reload();
    await page1.waitForSelector(".ProseMirror");
    await page2.reload();
    await page2.waitForSelector(".ProseMirror");

    // Wait for sync to happen (verify using text content convergence)
    await expect(page1.locator(".ProseMirror")).toContainText("User 1 offline edits.");
    await expect(page1.locator(".ProseMirror")).toContainText("User 2 online edits.");
    await expect(page1.locator(".ProseMirror")).toContainText("User 2 offline edits.");

    await expect(page2.locator(".ProseMirror")).toContainText("User 1 offline edits.");
    await expect(page2.locator(".ProseMirror")).toContainText("User 2 online edits.");
    await expect(page2.locator(".ProseMirror")).toContainText("User 2 offline edits.");

    // Assert absolute convergence (content is exact same on both browsers)
    await expect(async () => {
      const content1 = await page1.locator(".ProseMirror").innerText();
      const content2 = await page2.locator(".ProseMirror").innerText();
      expect(content1).toBe(content2);
    }).toPass({ timeout: 10000 });

    // 9. Version History & Restore Test
    // Clear editor and write version content
    await page1.locator(".ProseMirror").focus();
    await page1.keyboard.press("Meta+a");
    await page1.keyboard.press("Backspace");
    await page1.keyboard.type("Version 1 content.");

    // Give it a moment to sync to server (must exceed debounced save cycle)
    await page1.waitForTimeout(5000);

    // Save version
    await page1.click('button:has-text("Save Version")');
    await page1.fill('input[placeholder="e.g. Completed section 2, Draft V1, etc."]', "V1");
    await page1.click('button[type="submit"]:has-text("Save Version")');

    // Wait for the save version dialog to close completely
    await page1.waitForSelector('div[role="dialog"]', { state: "hidden" });

    // Make concurrent edits on both contexts
    await page1.locator(".ProseMirror").focus();
    await page1.keyboard.type(" Concurrent user 1 edits.");

    await page2.locator(".ProseMirror").focus();
    await page2.keyboard.type(" Concurrent user 2 edits.");

    // Wait briefly for WebSocket propagation between clients, but do not wait for DB save cycle.
    await page1.waitForTimeout(1000);

    // Navigate to History page for User 1
    await page1.click('a:has-text("History")');
    await page1.waitForURL(/\/versions/);

    // Select the V1 version in timeline
    await page1.click('div:has-text("V1")');

    // Accept the confirm dialog that appears during restore
    page1.once("dialog", (dialog) => dialog.accept());

    // Click Restore
    await page1.click('button:has-text("Restore")');

    // Should redirect back to editor or be back in editor (match exact document path, not /versions)
    await page1.waitForURL(new RegExp(`/documents/${docId}$`));
    await page1.waitForSelector(".ProseMirror");

    // The document should have restored "Version 1 content.",
    // but concurrent edits should still be present because of diff-and-reapply logic!
    await expect(page1.locator(".ProseMirror")).toContainText("Version 1 content.");
    await expect(page1.locator(".ProseMirror")).toContainText("Concurrent user 1 edits.");
    await expect(page1.locator(".ProseMirror")).toContainText("Concurrent user 2 edits.");

    // Clean up contexts
    await context1.close();
    await context2.close();
    await contextViewer.close();
  });
});
