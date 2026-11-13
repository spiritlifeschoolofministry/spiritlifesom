import { Facebook, Instagram, Music2, Twitter, Youtube } from "lucide-react";

/** The public pages, in menu order. Shared by the site header and the home page menu. */
export const publicNavLinks = [
  { label: "Home", to: "/" },
  { label: "About", to: "/about" },
  { label: "Courses", to: "/courses" },
  { label: "Faculty", to: "/faculty" },
  { label: "Contact", to: "/contact" },
  { label: "Verify", to: "/verify" },
];

export const socialLinks = [
  { label: "Facebook", href: "https://www.facebook.com/spiritlifeschoolofministry", Icon: Facebook },
  { label: "YouTube", href: "https://www.youtube.com/@SpiritLifeSchoolofMinistry", Icon: Youtube },
  { label: "Instagram", href: "https://www.instagram.com/spiritlifeschoolofministry", Icon: Instagram },
  { label: "X (Twitter)", href: "https://x.com/spiritlifesom", Icon: Twitter },
  { label: "TikTok", href: "https://tiktok.com/@spiritlifesom", Icon: Music2 },
];

/** The school's WhatsApp line (also behind the floating chat button). */
export const WHATSAPP_NUMBER = "2349165822262";

export const whatsappHref = (message: string) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
