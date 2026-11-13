import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CertificateArtwork } from "@/components/certificate/CertificateArtwork";
import type { CertificateArtworkProps } from "@/lib/certificate-design";

const props: CertificateArtworkProps = {
  recipientName: "Adebayo Oluwaseun Grace",
  studentCode: "SLSM/BBM/2025/001",
  dateText: "20 April 2025",
  mainText: "has successfully completed a year of intensive training",
  subText: "in the School of Ministry",
  signatories: [
    { name: "Pastor Folakemi Obadare", title: "Residence Pastor", signatureUrl: null },
    { name: "Prophet Cherub Obadare", title: "Founder/Proprietor", signatureUrl: null },
  ],
  serial: "SLSM-4K7P-92XT",
  verifyHost: "spiritlifesom.org/verify",
};

describe("CertificateArtwork without a layout", () => {
  // The snapshot was recorded from the component as it was before layouts
  // existed, so a cohort with no saved layout keeps printing that exact markup.
  it("renders exactly the original certificate", () => {
    const { container } = render(<CertificateArtwork {...props} />);
    expect(container.innerHTML).toMatchSnapshot();
  });
});

describe("CertificateArtwork with a layout", () => {
  const element = (container: HTMLElement, key: string) =>
    container.querySelector<HTMLElement>(`[data-layout-element="${key}"]`);

  it("treats a null or empty layout as no layout", () => {
    const plain = render(<CertificateArtwork {...props} />).container.innerHTML;
    expect(render(<CertificateArtwork {...props} layout={null} />).container.innerHTML).toBe(plain);
    expect(render(<CertificateArtwork {...props} layout={{}} />).container.innerHTML).toBe(plain);
  });

  it("moves an element to its layout position", () => {
    const { container } = render(
      <CertificateArtwork {...props} layout={{ date: { x: 0.25, y: 0.5 } }} />,
    );
    const date = element(container, "date");
    expect(date).toHaveTextContent("DATE: 20 April 2025");
    expect(date?.style.left).toBe(`${0.25 * 1123}px`);
    expect(date?.style.top).toBe(`${0.5 * 794}px`);
    expect(date?.style.transform).toMatch(/^translate\(-50%(, 0(px)?)?\)$/);
  });

  it("keeps the student code beside the name until it is placed", () => {
    const attached = render(<CertificateArtwork {...props} layout={{ date: { x: 0.25, y: 0.5 } }} />);
    expect(element(attached.container, "recipientName")).toHaveTextContent("SLSM/BBM/2025/001");
    expect(element(attached.container, "studentCode")).toBeNull();

    const placed = render(
      <CertificateArtwork {...props} layout={{ studentCode: { x: 0.9, y: 0.1 } }} />,
    );
    expect(element(placed.container, "recipientName")).not.toHaveTextContent("SLSM/BBM/2025/001");
    expect(element(placed.container, "studentCode")).toHaveTextContent("SLSM/BBM/2025/001");
  });

  it("anchors signatories by their bottom edge and scales their type", () => {
    const { container } = render(
      <CertificateArtwork {...props} layout={{ signatory2: { x: 0.9, y: 0.9, fontScale: 1.5 } }} />,
    );
    const block = element(container, "signatory2");
    expect(block?.style.transform).toBe("translate(-100%, -100%)");
    expect(block?.querySelector("p")?.style.fontSize).toBe("30px");
  });
});
