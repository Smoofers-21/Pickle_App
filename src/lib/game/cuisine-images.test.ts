import { describe, expect, it } from "vitest";
import { cuisineImage } from "./cuisine-images";

const lib = new Set(["restaurant-default", "bar-default", "italian", "mediterranean", "pub"]);

describe("cuisineImage", () => {
  it("matches a cuisine to its image, marked illustrative", () => {
    expect(cuisineImage(["italian"], "food", lib)).toEqual({ src: "/images/restaurants/italian.jpg", illustrative: true });
  });

  it("uses the first cuisine that has an image", () => {
    expect(cuisineImage(["thai", "italian"], "food", lib)?.src).toBe("/images/restaurants/italian.jpg");
  });

  it("follows the fallback chain for missing images", () => {
    expect(cuisineImage(["greek"], "food", lib)?.src).toBe("/images/restaurants/mediterranean.jpg");
    expect(cuisineImage(["biergarten"], "bars", lib)?.src).toBe("/images/restaurants/pub.jpg");
  });

  it("falls back to the restaurant or bar default", () => {
    expect(cuisineImage(["ethiopian"], "food", lib)?.src).toBe("/images/restaurants/restaurant-default.jpg");
    expect(cuisineImage([], "bars", lib)?.src).toBe("/images/restaurants/bar-default.jpg");
  });

  it("returns null (a plain placeholder) before any image is added", () => {
    expect(cuisineImage(["italian"], "food", new Set())).toBeNull();
  });
});
