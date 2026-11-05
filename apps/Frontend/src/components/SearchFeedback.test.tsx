import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SearchFailure, VehicleSkeletons } from "./SearchFeedback";
import { LocationHelp, MapLocationControl } from "./MapLocationControl";

test("skeletons retain the responsive card geometry without clickable controls", () => {
  const html = renderToStaticMarkup(<VehicleSkeletons count={6} />);
  expect(html.match(/aspect-\[4\/3\]/g)).toHaveLength(6);
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain("sm:grid-cols-2");
  expect(html).not.toContain("<button");
  expect(html).not.toContain("<a ");
  expect(renderToStaticMarkup(<VehicleSkeletons count={3} />).match(/aspect-\[4\/3\]/g)).toHaveLength(3);
});

test("failed searches offer a retry and prevent repeated clicks while retrying", () => {
  const failed = renderToStaticMarkup(<SearchFailure onRetry={() => {}} retrying={false} />);
  expect(failed).toContain("We couldn’t load vehicles");
  expect(failed).toContain("Try again");
  expect(failed).not.toContain("disabled=");
  expect(failed).not.toContain("backend");
  const retrying = renderToStaticMarkup(<SearchFailure onRetry={() => {}} retrying />);
  expect(retrying).toContain("Trying again…");
  expect(retrying).toContain('disabled=""');
});

test("blocked location explains site settings and offers retry and dismissal", () => {
  const html = renderToStaticMarkup(<LocationHelp state={{ status: "denied" }} onRetry={() => {}} onDismiss={() => {}} />);
  expect(html).toContain("browser’s site settings");
  expect(html).toContain("Try again");
  expect(html).toContain('aria-label="Close location help"');
  expect(html).toContain('role="status"');
});

test("unavailable and pending location states have appropriate guidance", () => {
  for (const reason of ["timeout", "unavailable"] as const) {
    expect(renderToStaticMarkup(<LocationHelp state={{ status: "error", reason }} onRetry={() => {}} onDismiss={() => {}} />))
      .toContain("We couldn’t get your location. Try again.");
  }
  for (const reason of ["insecure", "unavailable"] as const) {
    const html = renderToStaticMarkup(<LocationHelp state={{ status: "unsupported", reason }} onRetry={() => {}} onDismiss={() => {}} />);
    expect(html).not.toContain("Try again");
    expect(html).toContain(reason === "insecure" ? "HTTPS" : "isn’t supported");
  }
  const pending = renderToStaticMarkup(<LocationHelp state={{ status: "asking" }} onRetry={() => {}} onDismiss={() => {}} />);
  expect(pending).toContain("Finding your location…");
  expect(pending).not.toContain("Try again");
});

test("location starts as a clickable control without requesting permission during rendering", () => {
  let requests = 0;
  const html = renderToStaticMarkup(<MapLocationControl
    geo={{ status: "idle", requestLocation: async () => { requests++; return { status: "denied" }; } }}
    onLocate={() => {}} className="" />);
  expect(requests).toBe(0);
  expect(html).not.toContain("disabled=");
  expect(html).toContain('aria-label="Centre on my location"');
});
