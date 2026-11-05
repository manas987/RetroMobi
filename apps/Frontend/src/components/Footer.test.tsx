import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { Footer } from "./Footer";

test("homepage footer includes Browse scooters", () => {
  const html = renderToStaticMarkup(<Router ssrPath="/"><Footer onBrowse={() => {}} /></Router>);
  expect(html).toContain("Browse scooters");
  expect(html).toContain('type="button"');
});

test("Browse footer omits Browse scooters", () => {
  const html = renderToStaticMarkup(<Router ssrPath="/browse"><Footer /></Router>);
  expect(html).not.toContain("Browse scooters");
});
