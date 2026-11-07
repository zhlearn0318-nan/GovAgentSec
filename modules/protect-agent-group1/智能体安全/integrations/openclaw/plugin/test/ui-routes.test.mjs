import assert from "node:assert/strict";
import test from "node:test";
import {issueCapability} from "../../../../../../govagentsec-ui/access.mjs";
const request = method => ({method,url:"/protect-agent/ui/state",headers:{"x-govagentsec-panel":issueCapability(["/protect-agent/ui/state"])}});

import { registerProtectionUiRoutes } from "../ui-routes.mjs";

function createResponse() {
  return {
    statusCode: null,
    headers: {},
    setHeader(name,value){this.headers[name]=value;},
    body: null,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };
}

function setupStateRoute(snapshot) {
  const routes = [];
  registerProtectionUiRoutes(
    { registerHttpRoute(route) { routes.push(route); } },
    { snapshot: () => snapshot },
  );
  return routes.find((route) => route.path === "/protect-agent/ui/state");
}

test("the state route returns only the browser-safe snapshot without caching", () => {
  const snapshot = {
    version: "1",
    sequence: 8,
    updatedAt: 12_345,
    status: "running",
    decision: null,
    riskLevel: "LOW",
    riskScore: 0.03,
    steps: [],
  };
  const route = setupStateRoute(snapshot);
  const response = createResponse();

  route.handler(request("GET"), response);

  assert.equal(route.auth, "plugin");
  assert.equal(route.match, "exact");
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.equal(response.headers["X-Content-Type-Options"], "nosniff");
  assert.deepEqual(JSON.parse(response.body.toString("utf8")), snapshot);
});

test("the state route is read-only and supports bodyless HEAD checks", () => {
  const route = setupStateRoute({ status: "idle" });
  const rejected = createResponse();
  const head = createResponse();

  route.handler(request("POST"), rejected);
  route.handler(request("HEAD"), head);

  assert.equal(rejected.statusCode, 405);
  assert.equal(rejected.headers.Allow, "GET, HEAD");
  assert.equal(rejected.body, undefined);
  assert.equal(head.statusCode, 200);
  assert.equal(head.body, undefined);
});

test("unauthenticated state requests never expose protection state",()=>{const response=createResponse();setupStateRoute({status:"blocked"}).handler({method:"GET",url:"/protect-agent/ui/state",headers:{}},response);assert.equal(response.statusCode,401);assert.ok(!response.body.includes("blocked"));});
