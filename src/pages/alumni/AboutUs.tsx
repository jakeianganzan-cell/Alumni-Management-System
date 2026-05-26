import AlumniLayout from "@/components/alumni/AlumniLayout";
import { Eye, Target, Zap, Users, FileText, Heart, Bell, BarChart2 } from "lucide-react";
import OrganizationChart from "@/components/alumni/OrganizationChart";

const FEATURES = [
  {
    icon: Users,
    title: "Alumni Directory",
    desc: "Browse and connect with fellow SaCC graduates across all batches and programs.",
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
    desc: "Stay updated on alumni homecomings, career talks, webinars, and other SaCC activities.",
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
  return (
    <AlumniLayout title="About Us" subtitle="SaCC Alumni Portal">
      <div className="max-w-4xl mx-auto space-y-8">

        <OrganizationChart />

        {/* Vision */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 bg-navy/5 border-b border-border px-6 py-4">
            <div className="w-9 h-9 rounded-xl bg-navy flex items-center justify-center flex-shrink-0">
              <Eye className="w-5 h-5 text-gold" />
            </div>
            <div>
              <h3 className="font-display font-bold text-foreground text-base">SaCC Vision</h3>
              <p className="text-muted-foreground text-xs">Bisyon ng Kolehiyo</p>
            </div>
          </div>
          <div className="px-6 py-5 space-y-3">
            <p className="text-foreground text-sm leading-relaxed">
              The College is a recognized community institution providing accessible, quality education that bridges learning and livelihood.
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
              <h3 className="font-display font-bold text-foreground text-base">SaCC Mission</h3>
              <p className="text-muted-foreground text-xs">Misyon ng Kolehiyo</p>
            </div>
          </div>
          <div className="px-6 py-5 space-y-5">
            <p className="text-foreground text-sm font-medium">The mission of the College is to:</p>
            <ul className="space-y-3">
              {[
                "Provide quality and accessible education that equips students with knowledge and skills for the workforce,",
                "Foster community development through relevant programs and partnerships, and",
                "Contribute to national development through responsive and innovative educational practices.",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-foreground leading-relaxed">
                  <span className="w-6 h-6 rounded-full bg-navy text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

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
          SaCC Alumni Portal · Developed by Jake Ian Jamero and Team
        </div>
      </div>
    </AlumniLayout>
  );
}
