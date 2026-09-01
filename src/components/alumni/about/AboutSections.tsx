import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Award,
  BarChart2,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  ExternalLink,
  Eye,
  Facebook,
  FileText,
  GraduationCap,
  Heart,
  HeartPulse,
  History,
  Library,
  Mail,
  MapPin,
  Monitor,
  Phone,
  ShieldCheck,
  Target,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { SystemSettings } from "@/context/SystemSettingsContext";
import type { AboutContentItem } from "@/lib/about";
import type { CourseOption } from "@/lib/courseCatalog";
import { resolveAssetUrl } from "@/lib/api";
import { getMapEmbedUrl } from "@/lib/mapEmbed";
import salayBackground from "@/assets/salay-background.png";
import { INSTITUTION_OFFICIAL_SLOTS, normalizeInstitutionPosition, type InstitutionOfficialSlot } from "@/lib/institutionOfficials";

const SOFTWARE_FEATURES: Array<{ icon: LucideIcon; title: string; description: string }> = [
  { icon: Users, title: "Alumni Directory", description: "Organized alumni profiles and records across batches and academic programs." },
  { icon: FileText, title: "Graduate Tracer", description: "Graduate education, employment, and tracer information that supports institutional improvement." },
  { icon: Heart, title: "Donations", description: "Secure and transparent alumni contribution and donation management." },
  { icon: Bell, title: "Announcements & Events", description: "Institutional announcements, activities, reunions, events, and alumni engagement." },
  { icon: BarChart2, title: "Reports & Insights", description: "Alumni statistics and administrative insights for informed decision-making." },
  { icon: ShieldCheck, title: "Role-Based Access", description: "Appropriate functionality for administrators, officers, chairpersons, and alumni." },
];

const SERVICE_ICONS: Record<string, LucideIcon> = {
  book: BookOpen,
  "book-open": BookOpen,
  library: Library,
  health: HeartPulse,
  "heart-pulse": HeartPulse,
  technology: Monitor,
  monitor: Monitor,
  scholarship: GraduationCap,
  graduation: GraduationCap,
  guidance: Users,
  registrar: FileText,
  community: Heart,
};

const safeExternalUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
};

export function AboutPageSkeleton() {
  return <div className="mx-auto max-w-6xl space-y-6"><Skeleton className="h-24 w-full rounded-2xl" /><div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-44 rounded-2xl" /><Skeleton className="h-44 rounded-2xl" /></div><Skeleton className="h-64 rounded-2xl md:rounded-3xl" /></div>;
}

export function InstitutionalHero({ settings }: { settings: SystemSettings }) {
  const logo = resolveAssetUrl(settings.logoPath || settings.loginLogoPath || "") || settings.logoPath || settings.loginLogoPath;
  const websiteUrl = safeExternalUrl(settings.websiteUrl);

  return (
    <section className="flex flex-col items-start gap-3 border-b border-border pb-3">
      <div className="flex min-w-0 items-center gap-3">
        {logo && <img src={logo} alt={`${settings.institutionName} seal`} className="h-12 w-12 shrink-0 rounded-xl border border-border bg-white object-contain p-1.5 shadow-sm" />}
        {settings.institutionAddress && <p className="flex min-w-0 items-start gap-2 text-[11px] leading-5 text-muted-foreground md:text-xs"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{settings.institutionAddress}</p>}
      </div>
      <div className="grid w-full grid-cols-2 gap-1.5 sm:flex sm:w-auto sm:flex-wrap sm:justify-start sm:gap-2">
        <Button asChild variant="outline" className="h-8 w-full border-primary/35 bg-transparent px-2 text-[10px] text-primary hover:border-primary hover:bg-transparent hover:text-primary sm:h-9 sm:w-auto sm:px-4 sm:text-xs"><Link to="/alumni/about/institution"><Building2 className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />Institution</Link></Button>
        <Button asChild variant="outline" className="h-8 w-full border-primary/35 bg-transparent px-2 text-[10px] text-primary hover:border-primary hover:bg-transparent hover:text-primary sm:h-9 sm:w-auto sm:px-4 sm:text-xs"><Link to="/alumni/about/academics-alumni"><GraduationCap className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />Association</Link></Button>
        {websiteUrl && <Button asChild variant="outline" className="col-span-2 h-8 w-full bg-transparent px-2 text-[10px] sm:h-9 sm:w-auto sm:px-4 sm:text-xs"><a href={websiteUrl} target="_blank" rel="noreferrer">Visit Official Website<ExternalLink className="ml-1.5 h-3.5 w-3.5 sm:ml-2 sm:h-4 sm:w-4" /></a></Button>}
      </div>
    </section>
  );
}

function SectionHeading({ eyebrow, title, description, compact = false }: { eyebrow: string; title: string; description?: string; compact?: boolean }) {
  return <div className="max-w-3xl"><p className={`${compact ? "text-[8px] md:text-[9px]" : "text-[9px] md:text-[10px]"} font-semibold uppercase tracking-[0.18em] text-primary`}>{eyebrow}</p><h2 className={`${compact ? "mt-1 text-base md:text-lg" : "mt-1.5 text-lg md:text-xl"} font-display font-bold text-foreground`}>{title}</h2>{description && <p className={`${compact ? "mt-1.5 text-[10px] leading-4 md:text-[11px] md:leading-5" : "mt-2 text-xs leading-5 md:leading-6"} text-muted-foreground`}>{description}</p>}</div>;
}

export function InstitutionOverview({ settings }: { settings: SystemSettings }) {
  return <section className="rounded-xl border border-border/70 bg-card p-3 shadow-sm md:p-4"><SectionHeading compact eyebrow="Our Institution" title={`About ${settings.institutionName}`} /><p className="mt-2.5 max-w-4xl whitespace-pre-line text-[11px] leading-5 text-foreground md:text-xs">{settings.aboutContent}</p></section>;
}

export function InstitutionIdentity({ settings }: { settings: SystemSettings }) {
  const cards = [
    { icon: Eye, title: "Vision", subtitle: "", content: settings.vision },
    { icon: Target, title: "Mission", subtitle: "", content: settings.mission },
    { icon: BookOpen, title: "Philosophy", subtitle: "Our guiding principles", content: settings.philosophy },
    { icon: Zap, title: "Institutional Goal", subtitle: "What we strive to achieve", content: settings.institutionalGoal },
  ].filter((card) => card.content);
  if (!cards.length) return null;

  return <section><div className="grid gap-2 sm:grid-cols-2">{cards.map((card) => <article key={card.title} className="rounded-xl border border-border/70 bg-card p-3 shadow-sm">{card.title !== "Vision" && card.title !== "Mission" && <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10"><card.icon className="h-3.5 w-3.5 text-primary" /></div>}<h3 className={`${card.title !== "Vision" && card.title !== "Mission" ? "mt-2 " : ""}font-display text-xs font-bold text-foreground`}>{card.title}</h3>{card.subtitle && <p className="mt-0.5 text-[9px] font-medium text-muted-foreground">{card.subtitle}</p>}<p className="mt-2 whitespace-pre-line text-[11px] leading-5 text-foreground md:text-xs">{card.content}</p></article>)}</div></section>;
}

export function InstitutionalHistory({ entries, fallback }: { entries: AboutContentItem[]; fallback: string }) {
  if (!entries.length && !fallback) return null;
  return <section id="institutional-history" className="scroll-mt-24"><SectionHeading compact eyebrow="Our Story" title="Institutional Journey" description="The people, decisions, and milestones that shaped the college." />{fallback && <div className="mt-3 rounded-xl border border-border/70 bg-card p-3 shadow-sm"><p className="whitespace-pre-line text-[11px] leading-5 text-foreground md:text-xs">{fallback}</p></div>}{entries.length > 0 && <div className="relative mt-3 space-y-2 border-l border-primary/20 pl-4 md:ml-2 md:pl-5">{entries.map((entry) => <article key={entry.id} className="relative rounded-xl border border-border/70 bg-card p-3 shadow-sm"><span className="absolute -left-[19px] top-5 h-2 w-2 rounded-full bg-primary ring-3 ring-background md:-left-[25px]" />{entry.year && <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-primary md:text-[9px]">{entry.year}</p>}<div className="mt-1 grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]"> <div><h3 className="font-display text-xs font-bold text-foreground">{entry.title}</h3>{entry.subtitle && <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">{entry.subtitle}</p>}<p className="mt-1.5 whitespace-pre-line text-[11px] leading-5 text-foreground md:text-xs">{entry.description}</p></div>{entry.imageUrl && <img src={resolveAssetUrl(entry.imageUrl) || entry.imageUrl} alt={entry.title} className="h-24 w-full rounded-lg object-cover" loading="lazy" />}</div></article>)}</div>}</section>;
}

export function AcademicPrograms({ programs }: { programs: CourseOption[] }) {
  if (!programs.length) return null;
  return <section><SectionHeading compact eyebrow="Academic Excellence" title="Academic Programs" description="Programs administered by the college and represented across the alumni community." /><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{programs.map((program) => <article key={program.code} className="overflow-hidden rounded-xl border border-border/60 bg-card">{program.imageUrl && <img src={resolveAssetUrl(program.imageUrl) || program.imageUrl} alt="" className="h-20 w-full object-cover md:h-24" loading="lazy" />}<div className="p-3"><span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[8px] font-bold text-primary md:text-[9px]">{program.code}</span><h3 className="mt-2 font-display text-xs font-bold text-foreground">{program.label}</h3>{program.department && <p className="mt-0.5 text-[9px] font-medium text-muted-foreground">{program.department}</p>}{program.description && <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">{program.description}</p>}</div></article>)}</div></section>;
}

export function RecognitionMilestones({ entries }: { entries: AboutContentItem[] }) {
  if (!entries.length) return null;
  return <section><SectionHeading compact eyebrow="Institutional Progress" title="Recognition & Milestones" /><div className="mt-3 grid gap-2 md:grid-cols-2">{entries.map((entry) => <article key={entry.id} className="flex gap-2.5 rounded-xl border border-border/70 bg-card p-3 shadow-sm"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold/20"><Award className="h-3.5 w-3.5 text-amber-700" /></div><div>{entry.year && <p className="text-[9px] font-bold text-primary">{entry.year}</p>}<h3 className="mt-0.5 font-display text-xs font-bold text-foreground">{entry.title}</h3>{entry.organization && <p className="mt-0.5 text-[9px] font-medium text-muted-foreground">{entry.organization}</p>}<p className="mt-1.5 text-[11px] leading-4 text-muted-foreground md:text-xs">{entry.description}</p></div></article>)}</div></section>;
}

export function CollegeLeadership({ entries }: { entries: AboutContentItem[] }) {
  if (!entries.length) return null;
  const groupedEntries = entries.reduce<Array<{ category: string; people: AboutContentItem[] }>>((groups, entry) => {
    const category = entry.category || "College Leadership";
    const existing = groups.find((group) => group.category === category);
    if (existing) existing.people.push(entry);
    else groups.push({ category, people: [entry] });
    return groups;
  }, []);

  return (
    <section>
      <SectionHeading compact eyebrow="People of Service" title="College Leadership & Staff" description="Officials and personnel currently serving the institution, organized by office and role." />
      <div className="mt-3 space-y-4">
        {groupedEntries.map((group) => (
          <div key={group.category}>
            <h3 className="mb-2 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{group.category}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {group.people.map((entry) => (
                <article key={entry.id} className="overflow-hidden rounded-xl border border-border bg-card text-center shadow-sm md:rounded-2xl">
                  {entry.imageUrl ? <img src={resolveAssetUrl(entry.imageUrl) || entry.imageUrl} alt={entry.title} className="aspect-square w-full object-cover sm:aspect-[4/3]" loading="lazy" /> : <div className="flex aspect-square items-center justify-center bg-primary/10 sm:aspect-[4/3]"><Users className="h-8 w-8 text-primary/50 md:h-10 md:w-10" /></div>}
                  <div className="p-2.5 md:p-3">
                    <h4 className="font-display text-[11px] font-bold leading-4 text-foreground md:text-sm">{entry.title}{entry.credentials ? `, ${entry.credentials}` : ""}</h4>
                    {entry.subtitle && <p className="mt-1 text-[10px] font-semibold leading-4 text-primary md:text-[11px]">{entry.subtitle}</p>}
                    {entry.department && <p className="mt-1 text-[9px] leading-4 text-muted-foreground md:text-[10px]">{entry.department}</p>}
                    {entry.description && <p className="mt-2 text-[10px] leading-4 text-muted-foreground md:text-xs md:leading-5">{entry.description}</p>}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const INSTITUTION_POSITIONS = [
  {
    category: "Municipal Leadership",
    positions: ["Municipal Mayor", "Municipal Vice Mayor", "Local Chief Executive"],
  },
  {
    category: "College Executive Leadership",
    positions: ["Chairman-BOT", "College President", "Asst. to the President/Instructor", "Dean, College of Education", "VP Admin"],
  },
  {
    category: "Academic Department Leadership",
    positions: ["Dept. Head, BTLeD", "Dept. Head, BECeD", "Dept. Head, BS-ENTREP"],
  },
  {
    category: "Health and Student Services",
    positions: ["Health Services", "Dentist", "School Nurse", "OSA/College Counselor"],
  },
  {
    category: "Administrative and Learning Support",
    positions: ["Registrar II", "Cashier II", "Librarian I", "Computer Lab. In-Charge", "Registrar’s Office Clerk"],
  },
  {
    category: "Institutional Support",
    positions: ["Asst. to the DSA", "Asst. to the Guidance Counselor", "Communications", "Asst. to the VP", "Student Assistant", "Student Assistant"],
  },
] as const;

const normalizePosition = (value: string) => value
  .toLowerCase()
  .replace(/[’']/g, "")
  .replace(/\b(asst|assistant)\b/g, "assistant")
  .replace(/\b(dept|department)\b/g, "department")
  .replace(/\bin[ -]?charge\b/g, "incharge")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

export function InstitutionOrganizationChart({ entries }: { entries: AboutContentItem[] }) {
  const unusedEntries = [...entries];
  const groups = INSTITUTION_POSITIONS.map((group) => ({
    ...group,
    positions: group.positions.map((position, positionIndex) => {
      const normalizedPosition = normalizePosition(position);
      const entryIndex = unusedEntries.findIndex((entry) => {
        const searchableRole = normalizePosition(`${entry.subtitle} ${entry.department}`);
        return Boolean(searchableRole) && (searchableRole === normalizedPosition
          || searchableRole.includes(normalizedPosition)
          || normalizedPosition.includes(searchableRole));
      });
      const entry = entryIndex >= 0 ? unusedEntries.splice(entryIndex, 1)[0] : null;
      return { position, positionIndex, entry };
    }),
  }));

  return (
    <section>
      <SectionHeading eyebrow="Institutional Leadership" title="Institution Organization Chart" description="Municipal, college, academic, administrative, health, and student-support positions serving the institution." />
      <div className="mt-4 space-y-4">
        {groups.map((group) => (
          <div key={group.category}>
            <h3 className="mb-2 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground md:text-[10px]">{group.category}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {group.positions.map(({ position, positionIndex, entry }) => (
                <article key={`${position}-${positionIndex}`} className="flex min-h-24 flex-col items-center justify-center rounded-xl border border-border/60 bg-card p-3 text-center">
                  {entry?.imageUrl ? (
                    <img src={resolveAssetUrl(entry.imageUrl) || entry.imageUrl} alt={entry.title} className="h-10 w-10 rounded-lg border border-border object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10"><Building2 className="h-3.5 w-3.5 text-primary" /></div>
                  )}
                  <h4 className="mt-2 text-[10px] font-bold leading-4 text-foreground md:text-[11px]">{position}</h4>
                  {entry && <p className="mt-1 text-[9px] leading-3.5 text-muted-foreground md:text-[10px]">{entry.title}{entry.credentials ? `, ${entry.credentials}` : ""}</p>}
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function InstitutionLeadershipHierarchy({ entries }: { entries: AboutContentItem[] }) {
  const unusedEntries = [...entries];
  const assignEntries = (slots: readonly InstitutionOfficialSlot[]) => slots.map((slot, positionIndex) => {
    const position = slot.label;
    const aliases = position === "Local Chief Executive / Chairman-BOT"
      ? ["Local Chief Executive", "Chairman-BOT", position]
      : [position];
    const entryIndex = unusedEntries.findIndex((entry) => {
      const searchableRole = normalizeInstitutionPosition(`${entry.subtitle} ${entry.department}`);
      return Boolean(searchableRole) && aliases.some((alias) => {
        const normalizedAlias = normalizeInstitutionPosition(alias);
        return searchableRole === normalizedAlias
          || searchableRole.includes(normalizedAlias)
          || normalizedAlias.includes(searchableRole);
      });
    });
    const entry = entryIndex >= 0 ? unusedEntries.splice(entryIndex, 1)[0] : null;
    return { key: slot.key, position, positionIndex, entry };
  });

  const municipalLeaders = assignEntries(INSTITUTION_OFFICIAL_SLOTS.filter((slot) => slot.level === "municipal"));
  const executiveLeaders = assignEntries(INSTITUTION_OFFICIAL_SLOTS.filter((slot) => slot.level === "executive"));
  const staff = assignEntries(INSTITUTION_OFFICIAL_SLOTS.filter((slot) => slot.level === "staff"));

  const positionCard = (
    item: { key: string; position: string; positionIndex: number; entry: AboutContentItem | null },
    size: "large" | "medium" | "small",
  ) => {
    const avatarClass = size === "large" ? "h-14 w-14 md:h-20 md:w-20" : size === "medium" ? "h-12 w-12 md:h-16 md:w-16" : "h-10 w-10 md:h-12 md:w-12";
    const roleClass = size === "small" ? "text-[7px] md:text-[9px]" : "text-[8px] md:text-[10px]";
    const nameClass = size === "large" ? "text-[10px] md:text-xs" : "text-[9px] md:text-[11px]";

    return (
      <article className="flex min-w-0 flex-col items-center text-center">
        <div className={`${avatarClass} flex items-center justify-center overflow-hidden rounded-lg border-2 border-white bg-navy shadow-md`}>
          {item.entry?.imageUrl ? (
            <img src={resolveAssetUrl(item.entry.imageUrl) || item.entry.imageUrl} alt={item.entry.title} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <Building2 className="h-5 w-5 text-white/80" />
          )}
        </div>
        <p className={`mt-1 max-w-24 font-bold leading-tight text-white md:mt-1.5 md:max-w-32 ${nameClass}`}>{item.entry?.title || "TBA"}{item.entry?.credentials ? `, ${item.entry.credentials}` : ""}</p>
        <span className={`mt-0.5 inline-flex max-w-28 rounded-full border border-white/25 bg-white/10 px-1.5 py-0.5 font-semibold leading-3 text-white md:mt-1 md:max-w-40 md:px-2 ${roleClass}`}>{item.position}</span>
      </article>
    );
  };

  return (
    <section>
      <div
        className="relative overflow-hidden rounded-xl border border-border/60 bg-card p-2.5 shadow-sm md:p-4"
        style={{
          backgroundImage: `linear-gradient(rgba(20,20,20,0.82), rgba(85,0,0,0.78)), url(${salayBackground})`,
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
        <div className="relative z-10">
          <div className="mb-2 text-center md:mb-3">
            <h3 className="font-display text-sm font-bold text-white md:text-base">Institution Officials and Staff</h3>
            <p className="mt-1 text-[9px] text-white/70 md:text-[10px]">Salay Community College institutional organization</p>
            <div className="mx-auto mt-1.5 h-0.5 w-10 rounded-full bg-gold md:mt-2 md:w-12" />
          </div>

          <div className="mx-auto grid max-w-md grid-cols-2 gap-2 md:gap-3">
            {municipalLeaders.map((item) => <div key={item.key}>{positionCard(item, "large")}</div>)}
          </div>

          <div className="mx-auto my-2 w-full max-w-xl border-t border-dashed border-white/30 md:my-3" />

          <div className="mx-auto grid max-w-md grid-cols-2 gap-2 md:gap-3">
            {executiveLeaders.map((item) => <div key={item.key}>{positionCard(item, "medium")}</div>)}
          </div>

          <div className="mx-auto my-2 w-full max-w-3xl border-t border-dashed border-white/30 md:my-3" />

          <p className="mb-2 text-center text-[8px] font-semibold uppercase tracking-[0.14em] text-white/70 md:mb-3 md:text-[10px] md:tracking-[0.16em]">College Staff</p>
          <div className="grid grid-cols-3 gap-x-1 gap-y-2 sm:gap-x-2 sm:gap-y-3 lg:grid-cols-4 xl:grid-cols-5">
            {staff.map((item) => <div key={item.key}>{positionCard(item, "small")}</div>)}
          </div>
        </div>
      </div>
    </section>
  );
}

export function InstitutionServices({ entries }: { entries: AboutContentItem[] }) {
  if (!entries.length) return null;
  return (
    <section>
      <SectionHeading compact eyebrow="Campus Support" title="Frontline Services" description="Quick access to the offices and services available to students, alumni, and the wider community." />
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => {
          const Icon = SERVICE_ICONS[entry.icon.toLowerCase()] || Building2;
          const content = <><div className="flex items-start gap-2.5"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10"><Icon className="h-3.5 w-3.5 text-primary" /></div><div className="min-w-0 flex-1"><h3 className="font-display text-xs font-bold text-foreground">{entry.title}</h3>{entry.department && <p className="mt-0.5 text-[9px] font-semibold text-primary">{entry.department}</p>}</div>{entry.items?.length ? <ChevronDown className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" /> : null}</div>{entry.description && <p className="mt-2 text-[11px] leading-4 text-muted-foreground md:text-xs">{entry.description}</p>}</>;

          if (!entry.items?.length) return <article key={entry.id} className="rounded-xl border border-border/70 bg-card p-3 shadow-sm">{content}</article>;

          return (
            <details key={entry.id} className="group rounded-xl border border-border/70 bg-card shadow-sm">
              <summary className="cursor-pointer list-none rounded-xl p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">{content}</summary>
              <ul className="mx-3 mb-3 space-y-1.5 border-t border-border pt-2.5">
                {entry.items.map((item) => <li key={item.id} className="rounded-lg bg-muted/30 px-3 py-2"><p className="text-[11px] font-semibold text-foreground">{item.title}</p>{item.description && <p className="mt-1 text-[10px] leading-4 text-muted-foreground md:text-[11px] md:leading-5">{item.description}</p>}</li>)}
              </ul>
            </details>
          );
        })}
      </div>
    </section>
  );
}

export function AlumniFeatures() {
  return <section className="rounded-xl border border-border/60 bg-card p-3 md:rounded-2xl md:p-4"><p className="text-[8px] font-semibold uppercase tracking-[0.18em] text-primary md:text-[9px]">SaCC Alumni Management System</p><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{SOFTWARE_FEATURES.map((feature) => <article key={feature.title} className="rounded-lg border border-border/60 bg-muted/15 p-3 md:rounded-xl"><feature.icon className="h-3.5 w-3.5 text-primary" /><h3 className="mt-2 text-xs font-semibold text-foreground">{feature.title}</h3><p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">{feature.description}</p></article>)}</div></section>;
}

export function AlumniPortalAbout({ description }: { description: string }) {
  if (!description) return null;
  return <section className="grid gap-3 rounded-xl bg-navy p-3 text-white shadow-sm md:grid-cols-[auto_minmax(0,1fr)] md:rounded-2xl md:p-4"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10"><BriefcaseBusiness className="h-4 w-4 text-gold" /></div><div><p className="text-[8px] font-semibold uppercase tracking-[0.18em] text-gold md:text-[9px]">The Digital Platform</p><h2 className="mt-1 font-display text-base font-bold md:text-lg">About the Alumni Portal</h2><p className="mt-2 max-w-4xl whitespace-pre-line text-[10px] leading-4 text-white/80 md:text-[11px] md:leading-5">{description}</p></div></section>;
}

export function ContactAndSocial({ settings }: { settings: SystemSettings }) {
  const embeddedMapUrl = getMapEmbedUrl(settings.mapUrl);
  const contacts = [
    { icon: MapPin, label: "Address", value: settings.institutionAddress },
    { icon: Phone, label: "Contact", value: settings.institutionContact, href: settings.institutionContact ? `tel:${settings.institutionContact.replace(/\s/g, "")}` : "" },
    { icon: Mail, label: "Email", value: settings.institutionEmail, href: settings.institutionEmail ? `mailto:${settings.institutionEmail}` : "" },
    { icon: History, label: "Office Hours", value: settings.officeHours },
  ].filter((item) => item.value);
  const links = [
    { icon: ExternalLink, label: `${settings.institutionName} Website`, value: settings.websiteUrl },
    { icon: Facebook, label: `${settings.institutionName} Facebook Page`, value: settings.facebookLink },
    { icon: ExternalLink, label: "Google", value: settings.googleLink },
    { icon: ExternalLink, label: "Twitter", value: settings.twitterLink },
    { icon: ExternalLink, label: "Instagram", value: settings.instagramLink },
  ].map((item) => ({ ...item, value: safeExternalUrl(item.value) })).filter((item) => item.value);

  return <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]"><div className="rounded-xl border border-border/70 bg-card p-3 shadow-sm md:p-4"><SectionHeading compact eyebrow="Get in Touch" title="Contact & Location" /><div className="mt-3 grid gap-2 sm:grid-cols-2">{contacts.map((item) => <div key={item.label} className="rounded-lg border border-border/70 bg-muted/20 p-2.5"><item.icon className="h-3.5 w-3.5 text-primary" /><p className="mt-1.5 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground md:text-[9px]">{item.label}</p>{item.href ? <a href={item.href} className="mt-0.5 block break-words text-[11px] font-medium text-foreground hover:text-primary hover:underline md:text-xs">{item.value}</a> : <p className="mt-0.5 text-[11px] font-medium text-foreground md:text-xs">{item.value}</p>}</div>)}</div>{embeddedMapUrl && <div className="mt-3 overflow-hidden rounded-lg border border-border/70"><iframe src={embeddedMapUrl} title={`${settings.institutionName} location`} className="h-52 w-full border-0 md:h-60" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" /></div>}</div><div className="rounded-xl border border-border/70 bg-card p-3 shadow-sm md:p-4"><SectionHeading compact eyebrow="Stay Connected" title="Connect With SaCConnect" />{links.length ? <div className="mt-3 space-y-1.5">{links.map((item) => <a key={item.label} href={item.value} target="_blank" rel="noreferrer" className="flex min-h-9 items-center justify-between rounded-lg border border-border/70 px-2.5 py-2 text-[11px] font-semibold text-foreground transition hover:border-primary/40 hover:bg-primary/5"><span className="flex items-center gap-2"><item.icon className="h-3.5 w-3.5 text-primary" />{item.label}</span><ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /></a>)}</div> : <p className="mt-3 text-[11px] text-muted-foreground">Social links have not been configured yet.</p>}</div></section>;
}
