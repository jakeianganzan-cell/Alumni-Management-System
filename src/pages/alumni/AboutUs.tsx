import AlumniLayout from "@/components/alumni/AlumniLayout";
import { Eye, Target, Zap, Users, FileText, Heart, Bell, BarChart2, History, Mail, MapPin, Phone } from "lucide-react";
import OrganizationChart from "@/components/alumni/OrganizationChart";
import { useSystemSettings } from "@/context/SystemSettingsContext";

const FEATURES = [
  {
    icon: Users,
    title: "Alumni Directory",
    desc: "Browse and connect with fellow graduates across batches and programs.",
  },
  {
    icon: FileText,
    title: "Graduate Tracer",
    desc: "Complete and update your employment status to help the college track graduate outcomes and improve curriculum.",
  },
  {
    icon: Heart,
    title: "Donations",
    desc: "Contribute to scholarship funds and college projects through a secure and transparent donation system.",
  },
  {
    icon: Bell,
    title: "Announcements & Events",
    desc: "Stay updated on alumni homecomings, career talks, webinars, and institutional activities.",
  },
  {
    icon: BarChart2,
    title: "Reports & Insights",
    desc: "Administrators can access tracer data, donation reports, and engagement analytics to support decision-making.",
  },
  {
    icon: Zap,
    title: "Role-Based Access",
    desc: "Officers have role-specific permissions to manage only the modules relevant to their position.",
  },
];

export default function AboutUs() {
  const { settings } = useSystemSettings();
  const contactRows = [
    { icon: MapPin, label: "Address", value: settings.institutionAddress },
    { icon: Phone, label: "Contact", value: settings.institutionContact },
    { icon: Mail, label: "Email", value: settings.institutionEmail },
  ].filter((item) => item.value);
  const socialRows = [
    { label: "Facebook", value: settings.facebookLink },
    { label: "Twitter", value: settings.twitterLink },
    { label: "Instagram", value: settings.instagramLink },
    { label: "Website", value: settings.websiteUrl },
  ].filter((item) => item.value);

  return (
    <AlumniLayout title="About Us" subtitle={settings.systemShortName}>
      <div className="max-w-4xl mx-auto space-y-8">

        <OrganizationChart />

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-navy/5 px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{settings.systemName}</p>
            <h2 className="mt-1 font-display text-xl font-bold text-foreground">{settings.institutionName}</h2>
          </div>
          <div className="space-y-4 px-6 py-5">
            <p className="text-sm leading-relaxed text-foreground">
              {settings.aboutContent}
            </p>
            {contactRows.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-3">
                {contactRows.map((item) => (
                  <div key={item.label} className="rounded-xl border border-border bg-muted/30 p-3">
                    <item.icon className="h-4 w-4 text-navy" />
                    <p className="mt-2 text-xs font-semibold uppercase text-muted-foreground">{item.label}</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Vision */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 bg-navy/5 border-b border-border px-6 py-4">
            <div className="w-9 h-9 rounded-xl bg-navy flex items-center justify-center flex-shrink-0">
              <Eye className="w-5 h-5 text-gold" />
            </div>
            <div>
              <h3 className="font-display font-bold text-foreground text-base">Vision</h3>
              <p className="text-muted-foreground text-xs">Bisyon ng Kolehiyo</p>
            </div>
          </div>
          <div className="px-6 py-5 space-y-3">
            <p className="text-foreground text-sm leading-relaxed">
              {settings.vision}
            </p>
          </div>
        </div>

        {/* Mission */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 bg-navy/5 border-b border-border px-6 py-4">
            <div className="w-9 h-9 rounded-xl bg-gold flex items-center justify-center flex-shrink-0">
              <Target className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <h3 className="font-display font-bold text-foreground text-base">Mission</h3>
              <p className="text-muted-foreground text-xs">Misyon ng Kolehiyo</p>
            </div>
          </div>
          <div className="px-6 py-5">
            <p className="text-sm leading-relaxed text-foreground">{settings.mission}</p>
          </div>
        </div>

        {settings.history && (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex items-center gap-3 border-b border-border bg-navy/5 px-6 py-4">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-navy">
                <History className="h-5 w-5 text-gold" />
              </div>
              <div>
                <h3 className="font-display text-base font-bold text-foreground">School History</h3>
                <p className="text-xs text-muted-foreground">Institution background</p>
              </div>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm leading-relaxed text-foreground">{settings.history}</p>
            </div>
          </div>
        )}

        {/* System Features */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 bg-navy/5 border-b border-border px-6 py-4">
            <div className="w-9 h-9 rounded-xl bg-navy flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-gold" />
            </div>
            <div>
              <h3 className="font-display font-bold text-foreground text-base">System Features</h3>
              <p className="text-muted-foreground text-xs">What the Alumni Portal offers</p>
            </div>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FEATURES.map((f, i) => (
              <div key={i} className="flex items-start gap-4 p-4 rounded-xl bg-muted/40 border border-border hover:border-primary/30 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-navy/10 flex items-center justify-center flex-shrink-0">
                  <f.icon className="w-4 h-4 text-navy" />
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">{f.title}</p>
                  <p className="text-muted-foreground text-xs mt-0.5 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <div className="text-center text-muted-foreground text-xs pb-4">
          {socialRows.length > 0 && (
            <div className="mb-3 flex flex-wrap justify-center gap-3">
              {socialRows.map((item) => (
                <a key={item.label} href={item.value} target="_blank" rel="noreferrer" className="font-semibold text-navy hover:underline">
                  {item.label}
                </a>
              ))}
            </div>
          )}
          {settings.footerCopyrightText || settings.systemName}
        </div>
      </div>
    </AlumniLayout>
  );
}
