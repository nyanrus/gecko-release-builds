"use strict";

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

let httpserver = null;
ChromeUtils.defineLazyGetter(this, "cpURI", function () {
  return (
    "http://localhost:" + httpserver.identity.primaryPort + "/captive.html"
  );
});

const SUCCESS_STRING =
  '<meta http-equiv="refresh" content="0;url=https://support.mozilla.org/kb/captive-portal"/>';
let cpResponse = SUCCESS_STRING;
function contentHandler(metadata, response) {
  response.setHeader("Content-Type", "text/html");
  response.bodyOutputStream.write(cpResponse, cpResponse.length);
}

const PREF_CAPTIVE_ENABLED = "network.captive-portal-service.enabled";
const PREF_CAPTIVE_TESTMODE = "network.captive-portal-service.testMode";
const PREF_CAPTIVE_ENDPOINT = "captivedetect.canonicalURL";
const PREF_CAPTIVE_MINTIME = "network.captive-portal-service.minInterval";
const PREF_CAPTIVE_MAXTIME = "network.captive-portal-service.maxInterval";
const PREF_DNS_NATIVE_IS_LOCALHOST = "network.dns.native-is-localhost";

const cps = Cc["@mozilla.org/network/captive-portal-service;1"].getService(
  Ci.nsICaptivePortalService
);

registerCleanupFunction(async () => {
  Services.prefs.clearUserPref(PREF_CAPTIVE_ENABLED);
  Services.prefs.clearUserPref(PREF_CAPTIVE_TESTMODE);
  Services.prefs.clearUserPref(PREF_CAPTIVE_ENDPOINT);
  Services.prefs.clearUserPref(PREF_CAPTIVE_MINTIME);
  Services.prefs.clearUserPref(PREF_CAPTIVE_MAXTIME);
  Services.prefs.clearUserPref(PREF_DNS_NATIVE_IS_LOCALHOST);

  await new Promise(resolve => {
    httpserver.stop(resolve);
  });
});

function observerPromise(topic) {
  return new Promise(resolve => {
    let observer = {
      QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),
      observe(aSubject, aTopic, aData) {
        if (aTopic == topic) {
          Services.obs.removeObserver(observer, topic);
          resolve(aData);
        }
      },
    };
    Services.obs.addObserver(observer, topic);
  });
}

add_task(function setup() {
  httpserver = new HttpServer();
  httpserver.registerPathHandler("/captive.html", contentHandler);
  httpserver.start(-1);

  Services.prefs.setCharPref(PREF_CAPTIVE_ENDPOINT, cpURI);
  Services.prefs.setIntPref(PREF_CAPTIVE_MINTIME, 50);
  Services.prefs.setIntPref(PREF_CAPTIVE_MAXTIME, 100);
  Services.prefs.setBoolPref(PREF_CAPTIVE_TESTMODE, true);
  Services.prefs.setBoolPref(PREF_DNS_NATIVE_IS_LOCALHOST, true);
});

add_task(async function test_simple() {
  Services.prefs.setBoolPref(PREF_CAPTIVE_ENABLED, false);

  equal(cps.state, Ci.nsICaptivePortalService.UNKNOWN);

  let notification = observerPromise("network:captive-portal-connectivity");
  // The service is started by nsIOService when the pref becomes true.
  // We might want to add a method to do this in the future.
  Services.prefs.setBoolPref(PREF_CAPTIVE_ENABLED, true);

  let observerPayload = await notification;
  equal(observerPayload, "clear");
  equal(cps.state, Ci.nsICaptivePortalService.NOT_CAPTIVE);

  cpResponse = "other";
  notification = observerPromise("captive-portal-login");
  cps.recheckCaptivePortal();
  await notification;
  equal(cps.state, Ci.nsICaptivePortalService.LOCKED_PORTAL);

  cpResponse = SUCCESS_STRING;
  notification = observerPromise("captive-portal-login-success");
  cps.recheckCaptivePortal();
  await notification;
  equal(cps.state, Ci.nsICaptivePortalService.UNLOCKED_PORTAL);
});

// This test redirects to another URL which returns the same content.
// It should still be interpreted as a captive portal.
add_task(async function test_redirect_success() {
  Services.prefs.setBoolPref(PREF_CAPTIVE_ENABLED, false);
  equal(cps.state, Ci.nsICaptivePortalService.UNKNOWN);

  httpserver.registerPathHandler("/succ.txt", (metadata, response) => {
    response.setHeader("Content-Type", "text/html");
    response.bodyOutputStream.write(cpResponse, cpResponse.length);
  });
  httpserver.registerPathHandler("/captive.html", (metadata, response) => {
    response.setStatusLine(metadata.httpVersion, 307, "Moved Temporarily");
    response.setHeader(
      "Location",
      `http://localhost:${httpserver.identity.primaryPort}/succ.txt`
    );
  });

  let notification = observerPromise("captive-portal-login").then(
    () => "login"
  );
  let succNotif = observerPromise("network:captive-portal-connectivity").then(
    () => "connectivity"
  );
  Services.prefs.setBoolPref(PREF_CAPTIVE_ENABLED, true);

  let winner = await Promise.race([notification, succNotif]);
  equal(winner, "login", "This should have been a login, not a success");
  equal(
    cps.state,
    Ci.nsICaptivePortalService.LOCKED_PORTAL,
    "Should be locked after redirect to same text"
  );
});

// This redirects to another URI with a different content.
// We check that it triggers a captive portal login
add_task(async function test_redirect_bad() {
  Services.prefs.setBoolPref(PREF_CAPTIVE_ENABLED, false);
  equal(cps.state, Ci.nsICaptivePortalService.UNKNOWN);

  httpserver.registerPathHandler("/bad.txt", (metadata, response) => {
    response.setHeader("Content-Type", "text/html");
    response.bodyOutputStream.write("bad", "bad".length);
  });

  httpserver.registerPathHandler("/captive.html", (metadata, response) => {
    response.setStatusLine(metadata.httpVersion, 307, "Moved Temporarily");
    response.setHeader(
      "Location",
      `http://localhost:${httpserver.identity.primaryPort}/bad.txt`
    );
  });

  let notification = observerPromise("captive-portal-login");
  Services.prefs.setBoolPref(PREF_CAPTIVE_ENABLED, true);

  await notification;
  equal(
    cps.state,
    Ci.nsICaptivePortalService.LOCKED_PORTAL,
    "Should be locked after redirect to bad text"
  );
});

// This redirects to the same URI.
// We check that it triggers a captive portal login
add_task(async function test_redirect_loop() {
  Services.prefs.setBoolPref(PREF_CAPTIVE_ENABLED, false);
  equal(cps.state, Ci.nsICaptivePortalService.UNKNOWN);

  // This is actually a redirect loop
  httpserver.registerPathHandler("/captive.html", (metadata, response) => {
    response.setStatusLine(metadata.httpVersion, 307, "Moved Temporarily");
    response.setHeader("Location", cpURI);
  });

  let notification = observerPromise("captive-portal-login");
  Services.prefs.setBoolPref(PREF_CAPTIVE_ENABLED, true);

  await notification;
  equal(cps.state, Ci.nsICaptivePortalService.LOCKED_PORTAL);
});

// This redirects to a https URI.
// We check that it triggers a captive portal login
add_task(async function test_redirect_https() {
  Services.prefs.setBoolPref(PREF_CAPTIVE_ENABLED, false);
  equal(cps.state, Ci.nsICaptivePortalService.UNKNOWN);

  let h2Port = Services.env.get("MOZHTTP2_PORT");
  Assert.notEqual(h2Port, null);
  Assert.notEqual(h2Port, "");

  // Any kind of redirection should trigger the captive portal login.
  httpserver.registerPathHandler("/captive.html", (metadata, response) => {
    response.setStatusLine(metadata.httpVersion, 307, "Moved Temporarily");
    response.setHeader("Location", `https://foo.example.com:${h2Port}/exit`);
  });

  let notification = observerPromise("captive-portal-login");
  Services.prefs.setBoolPref(PREF_CAPTIVE_ENABLED, true);

  await notification;
  equal(
    cps.state,
    Ci.nsICaptivePortalService.LOCKED_PORTAL,
    "Should be locked after redirect to https"
  );
  Services.prefs.setBoolPref(PREF_CAPTIVE_ENABLED, false);
});

// This test uses a 511 status code to request a captive portal login
// We check that it triggers a captive portal login
// See RFC 6585 for details
add_task(async function test_511_error() {
  Services.prefs.setBoolPref(PREF_CAPTIVE_ENABLED, false);
  equal(cps.state, Ci.nsICaptivePortalService.UNKNOWN);

  httpserver.registerPathHandler("/captive.html", (metadata, response) => {
    response.setStatusLine(
      metadata.httpVersion,
      511,
      "Network Authentication Required"
    );
    cpResponse = '<meta http-equiv="refresh" content="0;url=/login">';
    contentHandler(metadata, response);
  });

  let notification = observerPromise("captive-portal-login");
  Services.prefs.setBoolPref(PREF_CAPTIVE_ENABLED, true);

  await notification;
  equal(cps.state, Ci.nsICaptivePortalService.LOCKED_PORTAL);
});

// Any other 5xx HTTP error, is assumed to be an issue with the
// canonical web server, and should not trigger a captive portal login
add_task(async function test_generic_5xx_error() {
  Services.prefs.setBoolPref(PREF_CAPTIVE_ENABLED, false);
  equal(cps.state, Ci.nsICaptivePortalService.UNKNOWN);

  let requests = 0;
  httpserver.registerPathHandler("/captive.html", (metadata, response) => {
    if (requests++ === 0) {
      // on first attempt, send 503 error
      response.setStatusLine(
        metadata.httpVersion,
        503,
        "Internal Server Error"
      );
      cpResponse = "<h1>Internal Server Error</h1>";
    } else {
      // on retry, send canonical reply
      cpResponse = SUCCESS_STRING;
    }
    contentHandler(metadata, response);
  });

  let notification = observerPromise("network:captive-portal-connectivity");
  Services.prefs.setBoolPref(PREF_CAPTIVE_ENABLED, true);

  await notification;
  equal(requests, 2);
  equal(cps.state, Ci.nsICaptivePortalService.NOT_CAPTIVE);
});

add_task(async function test_changed_notification() {
  Services.prefs.setBoolPref(PREF_CAPTIVE_ENABLED, false);
  equal(cps.state, Ci.nsICaptivePortalService.UNKNOWN);

  httpserver.registerPathHandler("/captive.html", contentHandler);
  cpResponse = SUCCESS_STRING;

  let changedNotificationCount = 0;
  let observer = {
    QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),
    observe() {
      changedNotificationCount += 1;
    },
  };
  Services.obs.addObserver(
    observer,
    "network:captive-portal-connectivity-changed"
  );

  let notification = observerPromise(
    "network:captive-portal-connectivity-changed"
  );
  Services.prefs.setBoolPref(PREF_CAPTIVE_ENABLED, true);
  await notification;
  equal(changedNotificationCount, 1);
  equal(cps.state, Ci.nsICaptivePortalService.NOT_CAPTIVE);

  notification = observerPromise("network:captive-portal-connectivity");
  cps.recheckCaptivePortal();
  await notification;
  equal(changedNotificationCount, 1);
  equal(cps.state, Ci.nsICaptivePortalService.NOT_CAPTIVE);

  notification = observerPromise("captive-portal-login");
  cpResponse = "you are captive";
  cps.recheckCaptivePortal();
  await notification;
  equal(changedNotificationCount, 1);
  equal(cps.state, Ci.nsICaptivePortalService.LOCKED_PORTAL);

  notification = observerPromise("captive-portal-login-success");
  cpResponse = SUCCESS_STRING;
  cps.recheckCaptivePortal();
  await notification;
  equal(changedNotificationCount, 2);
  equal(cps.state, Ci.nsICaptivePortalService.UNLOCKED_PORTAL);

  notification = observerPromise("captive-portal-login");
  cpResponse = "you are captive";
  cps.recheckCaptivePortal();
  await notification;
  equal(changedNotificationCount, 2);
  equal(cps.state, Ci.nsICaptivePortalService.LOCKED_PORTAL);

  Services.obs.removeObserver(
    observer,
    "network:captive-portal-connectivity-changed"
  );
});
