import { describe, it, expect } from "vitest";
import { isTrustedUploadUrl } from "./upload-validation";

describe("isTrustedUploadUrl", () => {
  it("accepts our own Cloudinary cloud and the local fallback", () => {
    expect(isTrustedUploadUrl("https://res.cloudinary.com/mycloud/image/upload/v1/hrms_kyc/x.jpg", "mycloud")).toBe(true);
    expect(isTrustedUploadUrl("/uploads/kyc/EMP-0001/photo_1.jpg")).toBe(true);
  });
  it("rejects other hosts, other clouds, traversal and non-strings", () => {
    expect(isTrustedUploadUrl("https://evil.example/x.jpg", "mycloud")).toBe(false);
    expect(isTrustedUploadUrl("https://res.cloudinary.com/othercloud/x.jpg", "mycloud")).toBe(false);
    expect(isTrustedUploadUrl("https://res.cloudinary.com/mycloud/x.jpg")).toBe(false);
    expect(isTrustedUploadUrl("/uploads/kyc/../../etc/passwd")).toBe(false);
    expect(isTrustedUploadUrl("#", "mycloud")).toBe(false);
    expect(isTrustedUploadUrl(undefined)).toBe(false);
    expect(isTrustedUploadUrl("javascript:alert(1)", "mycloud")).toBe(false);
  });
});
