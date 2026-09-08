import puppeteer from "puppeteer-core";

const appUrl = (process.env.BROWSER_TEST_URL || "http://127.0.0.1:5179").replace(/\/+$/, "");
const executablePath = process.env.CHROME_EXECUTABLE;
const adminEmail = process.env.BROWSER_TEST_ADMIN_EMAIL;
const adminPassword = process.env.BROWSER_TEST_ADMIN_PASSWORD;
const alumniEmail = process.env.BROWSER_TEST_ALUMNI_EMAIL;
const alumniPassword = process.env.BROWSER_TEST_ALUMNI_PASSWORD;

if (!executablePath || !adminEmail || !adminPassword) {
  throw new Error("CHROME_EXECUTABLE and browser test admin credentials are required.");
}

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const page = await browser.newPage();
const failures = [];
const pageErrors = [];
const requestFailures = [];
let currentCheck = "launch";
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("requestfailed", (request) => requestFailures.push(`${request.url()}: ${request.failure()?.errorText || "failed"}`));

const checkLayout = async (label) => {
  const result = await page.evaluate(() => ({
    bodyTextLength: document.body.innerText.trim().length,
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  if (result.bodyTextLength < 20) failures.push(`${label}: page rendered blank`);
  if (result.documentWidth > result.viewportWidth + 2) {
    failures.push(`${label}: document overflows horizontally (${result.documentWidth}px > ${result.viewportWidth}px)`);
  }
};

try {
  currentCheck = "mobile login page";
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.goto(appUrl, { waitUntil: "networkidle0", timeout: 60_000 });
  await checkLayout("mobile login");

  const identifier = await page.$('input[type="text"]');
  const password = await page.$('input[type="password"]');
  if (!identifier || !password) throw new Error("Login fields were not rendered.");
  await identifier.type(adminEmail);
  await password.type(adminPassword);
  await page.click('button[type="submit"]');
  currentCheck = "admin login redirect";
  await page.waitForFunction(() => location.pathname.startsWith("/admin") || document.body.innerText.toLowerCase().includes("select role"), { timeout: 30_000 });

  if (await page.evaluate(() => document.body.innerText.toLowerCase().includes("select role"))) {
    const selected = await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((item) => /system administrator/i.test(item.textContent || ""));
      button?.click();
      return Boolean(button);
    });
    if (!selected) throw new Error("Admin role selection button was not found.");
    currentCheck = "admin role selection redirect";
    await page.waitForFunction(() => location.pathname.startsWith("/admin"), { timeout: 30_000 });
  }

  currentCheck = "admin route rendering";
  const routes = [
    ["mobile dashboard", "/admin"],
    ["mobile alumni", "/admin/alumni"],
    ["mobile tracer", "/admin/tracer"],
    ["mobile announcements", "/admin/announcements"],
    ["mobile donations", "/admin/donations"],
    ["mobile contributions", "/admin/contributions"],
  ];
  for (const [label, route] of routes) {
    await page.goto(`${appUrl}${route}`, { waitUntil: "networkidle0", timeout: 60_000 });
    await checkLayout(label);
  }

  await page.goto(`${appUrl}/admin/donations`, { waitUntil: "networkidle0", timeout: 60_000 });
  currentCheck = "merged donation workflow";
  const clickButton = async (label) => page.evaluate((text) => {
    const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.trim() === text);
    button?.click();
    return Boolean(button);
  }, label);
  await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("method / type") && document.body.innerText.toLowerCase().includes("amount / items"), { timeout: 5_000 }).catch(() => undefined);
  const donationColumnsVisible = await page.evaluate(() => document.body.innerText.toLowerCase().includes("method / type") && document.body.innerText.toLowerCase().includes("amount / items"));
  if (!donationColumnsVisible) failures.push("merged donation columns were not rendered");
  const paymentSettingsVisible = await page.evaluate(() => document.body.innerText.toLowerCase().includes("payment settings"));
  if (!paymentSettingsVisible) failures.push("donation payment settings were not preserved");

  await page.goto(`${appUrl}/admin/contributions`, { waitUntil: "networkidle0", timeout: 60_000 });
  currentCheck = "contribution categories";
  if (!await clickButton("Donation")) failures.push("merged donation category control was not rendered");
  if (!await clickButton("Volunteer Service")) failures.push("volunteer service category control was not rendered");
  const removedViewControlsVisible = await page.evaluate(() => document.body.innerText.includes("Contribution Records") || document.body.innerText.includes("Analytics"));
  if (removedViewControlsVisible) failures.push("removed contribution view controls were still rendered");
  await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("contributor") && document.body.innerText.toLowerCase().includes("value / hours"), { timeout: 5_000 }).catch(() => undefined);
  const contributionRecordsVisible = await page.evaluate(() => document.body.innerText.toLowerCase().includes("contributor") && document.body.innerText.toLowerCase().includes("value / hours"));
  if (!contributionRecordsVisible) failures.push("volunteer contribution records were not rendered");
  await checkLayout("mobile categorized contributions");

  await page.setViewport({ width: 768, height: 1024, deviceScaleFactor: 1 });
  currentCheck = "tablet announcements";
  await page.goto(`${appUrl}/admin/announcements`, { waitUntil: "networkidle0", timeout: 60_000 });
  await checkLayout("tablet announcements");

  const client = await page.createCDPSession();
  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 500,
    downloadThroughput: 200 * 1024 / 8,
    uploadThroughput: 100 * 1024 / 8,
  });
  currentCheck = "slow-network contributions";
  await page.goto(`${appUrl}/admin/donations`, { waitUntil: "networkidle0", timeout: 90_000 });
  await checkLayout("slow-network donations");
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });

  await page.setRequestInterception(true);
  const failureRequestHandler = (request) => {
    if (request.url().includes("/api/donations") || request.url().includes("/api/admin/donations/")) request.abort();
    else request.continue();
  };
  page.on("request", failureRequestHandler);
  currentCheck = "contribution API failure state";
  await page.goto(`${appUrl}/admin/contributions`, { waitUntil: "networkidle0", timeout: 60_000 });
  const survivedFailure = await page.evaluate(() => document.body.innerText.includes("Contribution Tracking"));
  if (!survivedFailure) failures.push("frontend server-failure handling: Contribution page disappeared after API failures");

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await checkLayout("desktop donation failure state");

  if (alumniEmail && alumniPassword) {
    page.off("request", failureRequestHandler);
    await page.setRequestInterception(false);
    await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload({ waitUntil: "networkidle0", timeout: 60_000 });
    const alumniIdentifier = await page.$('input[type="text"]');
    const alumniPasswordField = await page.$('input[type="password"]');
    if (!alumniIdentifier || !alumniPasswordField) throw new Error("Alumni login fields were not rendered.");
    await alumniIdentifier.type(alumniEmail);
    await alumniPasswordField.type(alumniPassword);
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => location.pathname.startsWith("/alumni"), { timeout: 30_000 });
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.goto(`${appUrl}/alumni/donate`, { waitUntil: "networkidle0", timeout: 60_000 });
    await checkLayout("mobile alumni donations");
    const donationPageVisible = await page.evaluate(() => document.body.innerText.includes("My Donation History") && document.body.innerText.includes("Donation Amount"));
    if (!donationPageVisible) failures.push("alumni financial donation workflow did not render");
    const alumniContributionMenuVisible = await page.evaluate(() => document.body.innerText.includes("Contributions"));
    if (alumniContributionMenuVisible) failures.push("retired alumni Contributions menu was still rendered");
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const visibleText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 500)).catch(() => "");
  const failedRequests = requestFailures.slice(-5).join(" | ");
  failures.push(`${currentCheck}: ${message} (url: ${page.url()}, visible: ${visibleText}${failedRequests ? `, requests: ${failedRequests}` : ""})`);
} finally {
  await browser.close();
}

if (pageErrors.length > 0) failures.push(`browser page errors: ${pageErrors.join(" | ")}`);

if (failures.length > 0) {
  console.error("Browser smoke checks failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("Browser smoke checks passed: mobile, tablet, desktop, slow network, and API failure rendering.");
}
