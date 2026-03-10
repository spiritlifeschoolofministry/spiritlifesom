import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MapPin, Phone, Mail, Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ContactPage = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim() || !message.trim()) {
      toast.error("Please fill in all fields");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-contact-email", {
        body: { name, email, message },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Message sent successfully! We'll get back to you soon.");
      setName("");
      setEmail("");
      setMessage("");
    } catch (err: any) {
      console.error("Contact form error:", err);
      toast.error(err.message || "Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      {/* Hero */}
      <section className="relative py-20 sm:py-28 text-center text-primary-foreground">
        <div className="absolute inset-0 gradient-purple" />
        <div className="relative z-10 max-w-3xl mx-auto px-4 space-y-3">
          <h1 className="text-3xl sm:text-5xl font-extrabold">Get In Touch</h1>
          <p className="text-primary-foreground/80 text-lg">We'd love to hear from you</p>
        </div>
      </section>

      {/* Contact content */}
      <section className="py-20 px-4 sm:px-6 bg-background">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12">
          {/* Contact info */}
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-primary">Contact Details</h2>
            <div className="flex gap-3">
              <MapPin className="text-accent shrink-0 mt-1" size={20} />
              <p className="text-muted-foreground text-sm sm:text-base">Spirit Life C&S Church, John Olorombo Street, Balogun Isale, 200258, Ibadan, Nigeria</p>
            </div>
            <div className="flex gap-3">
              <Phone className="text-accent shrink-0 mt-1" size={20} />
              <p className="text-muted-foreground text-sm sm:text-base">+234 809 092 5555</p>
            </div>
            <div className="flex gap-3">
              <Mail className="text-accent shrink-0 mt-1" size={20} />
              <p className="text-muted-foreground text-sm sm:text-base break-all">spiritlifeschoolofministry@gmail.com</p>
            </div>
            <div className="rounded-xl overflow-hidden border border-border h-56 bg-muted flex items-center justify-center text-muted-foreground text-sm">
              Map placeholder
            </div>
          </div>

          {/* Contact form */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-primary">Send a Message</h2>
            <Input
              placeholder="Full Name"
              className="bg-card"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              placeholder="Email"
              type="email"
              className="bg-card"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Textarea
              placeholder="Your message..."
              rows={5}
              className="bg-card"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <Button
              className="w-full gradient-flame border-0 text-primary-foreground hover:opacity-90 gap-2"
              onClick={handleSubmit}
              disabled={sending}
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" /> Send Message
                </>
              )}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ContactPage;
