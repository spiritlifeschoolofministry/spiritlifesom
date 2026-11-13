import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSiteContent } from "@/hooks/use-site-content";
import SEO from "@/components/SEO";

const detailLabel = "text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground";
const detailLink =
  "inline-flex min-h-11 w-fit items-center rounded text-[15px] font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-foreground";
const fieldClass = "h-[46px] rounded-xl bg-card px-3 text-base md:text-base";

const ContactPage = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const { get } = useSiteContent("contact");

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim() || !message.trim()) {
      toast.error("Please fill in all fields");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-contact-email", {
        body: { name, email, subject, message },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Message sent successfully! We'll get back to you soon.");
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch (err) {
      console.error("Contact form error:", err);
      toast.error(err.message || "Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const address = get("address", "Spirit Life C&S Church, John Olorombo Street, Balogun Isale, 200258, Ibadan, Nigeria");
  const phone = get("phone", "+234 916 582 2262");
  const contactEmail = get("email", "spiritlifeschoolofministry@gmail.com");

  return (
    <div className="bg-card">
      <SEO
        title="Contact SLSOM | Spirit Life School of Ministry"
        description="Get in touch with Spirit Life School of Ministry. Reach our admissions team by email or phone, or send a message directly through our contact form."
        path="/contact"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "ContactPage",
          name: "Contact Spirit Life School of Ministry",
          url: "https://spiritlifesom.org/contact",
        }}
      />
      <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-4 pb-[72px] pt-12 sm:px-6 sm:pt-14 lg:flex-row">
        {/* Heading and contact details */}
        <div className="flex min-w-0 flex-1 flex-col gap-[18px]">
          <h1 className="text-[34px] font-extrabold tracking-tight sm:text-[44px]">{get("hero_title", "Get In Touch")}</h1>
          <p className="text-[17px] text-muted-foreground sm:text-lg">{get("hero_subtitle", "We'd love to hear from you")}</p>
          <div className="flex flex-col gap-3.5 rounded-[18px] bg-background p-[22px]">
            <h2 className="text-[17px] font-bold">{get("details_title", "Contact Details")}</h2>
            <div className="flex flex-col gap-0.5">
              <span className={detailLabel}>Address</span>
              <span className="text-[15px] leading-normal">{address}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className={detailLabel}>Phone and WhatsApp</span>
              <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className={detailLink}>{phone}</a>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className={detailLabel}>Email</span>
              <a href={`mailto:${contactEmail}`} className={`${detailLink} break-anywhere`}>{contactEmail}</a>
            </div>
          </div>
        </div>

        {/* Contact form */}
        <form
          onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }}
          className="flex min-w-0 flex-1 flex-col gap-3.5 rounded-[20px] border border-border bg-card p-5 sm:p-[26px] lg:flex-[1.2]"
          noValidate
        >
          <h2 className="text-[22px] font-extrabold tracking-tight">{get("form_title", "Send a Message")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact-name" className="text-sm font-semibold">Name</Label>
              <Input id="contact-name" autoComplete="name" className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact-email" className="text-sm font-semibold">Email</Label>
              <Input id="contact-email" type="email" autoComplete="email" className={fieldClass} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact-subject" className="text-sm font-semibold">Subject <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="contact-subject" maxLength={120} className={fieldClass} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact-message" className="text-sm font-semibold">Message</Label>
            <Textarea
              id="contact-message"
              rows={5}
              className="rounded-xl bg-card px-3 py-2.5 text-base md:text-base"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={sending}
            className="inline-flex h-[50px] items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {sending ? (
              <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Sending...</>
            ) : (
              <><Send className="h-4 w-4" aria-hidden="true" /> Send message</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ContactPage;
