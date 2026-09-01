import { clientLogger } from "@/lib/logger";
import { useEffect, useState } from "react";
import salayBackground from "@/assets/salay-background.png";
import { API_URL, getAuthHeaders, readApiResponse, resolveAssetUrl } from "@/lib/api";
import { useSystemSettings } from "@/context/SystemSettingsContext";

type DashboardOfficer = {
  name: string;
  role: string;
  positionLabel?: string;
  photo?: string | null;
  schoolYear?: string | null;
};

interface DashboardResponse {
  officers?: DashboardOfficer[];
}

function OfficerCard({
  name,
  role,
  photo,
  size = "md",
  accent = "navy",
  textTone = "dark",
}: {
  name: string;
  role: string;
  photo?: string | null;
  size?: "sm" | "md" | "lg";
  accent?: string;
  textTone?: "dark" | "light";
}) {
  const sizeMap = {
    sm: { avatar: "h-10 w-10 md:h-12 md:w-12", text: "text-sm md:text-base", name: "text-[9px] md:text-[10px]", badge: "text-[8px] px-1.5 md:text-[9px]" },
    md: { avatar: "h-12 w-12 md:h-16 md:w-16", text: "text-sm md:text-base", name: "text-[9px] md:text-[10px]", badge: "text-[8px] px-1.5 md:text-[9px]" },
    lg: { avatar: "h-16 w-16 md:h-20 md:w-20", text: "text-lg md:text-xl", name: "text-[10px] md:text-[11px]", badge: "text-[8px] px-1.5 md:text-[9px] md:px-2" },
  };
  const bgMap: Record<string, string> = {
    navy: "bg-navy",
    gold: "bg-gold",
    emerald: "bg-emerald-600",
    teal: "bg-teal-500",
    amber: "bg-amber-500",
    orange: "bg-orange-500",
    purple: "bg-purple-600",
    slate: "bg-slate-500",
    blue: "bg-blue-600",
  };
  const s = sizeMap[size];
  const bg = bgMap[accent] ?? "bg-navy";
  const nameTextClassName = textTone === "light" ? "text-white" : "text-navy-dark";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`${s.avatar} flex items-center justify-center overflow-hidden rounded-lg border-2 border-white shadow-sm ${bg}`}>
        {photo ? (
          <img src={resolveAssetUrl(photo) || undefined} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className={`font-bold text-white ${s.text}`}>{name[0]}</span>
        )}
      </div>
      <div className="text-center">
        <p className={`max-w-[70px] font-bold leading-tight md:max-w-[90px] ${s.name} ${nameTextClassName}`}>{name}</p>
        <span className={`mt-0.5 inline-block rounded-full py-0.5 font-semibold text-white ${bg} ${s.badge}`}>{role}</span>
      </div>
    </div>
  );
}

function VConn({ h = 6, mdH, className = "bg-border" }: { h?: number; mdH?: number; className?: string }) {
  return (
    <div
      className={`mx-auto h-[var(--conn-h)] w-0.5 md:h-[var(--conn-md-h)] ${className}`}
      style={
        {
          "--conn-h": `${h * 4}px`,
          "--conn-md-h": `${(mdH ?? h) * 4}px`,
        } as React.CSSProperties
      }
    />
  );
}

export default function OrganizationChart() {
  const { settings } = useSystemSettings();
  const [officers, setOfficers] = useState<DashboardOfficer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchOfficers = async () => {
      try {
        setError("");
        const response = await fetch(`${API_URL}/alumni/dashboard`, {
          headers: getAuthHeaders(),
        });
        const data = await readApiResponse<DashboardResponse>(response);
        setOfficers(
          (data.officers || []).map((officer) => ({
            ...officer,
            role: String(officer.role || "").trim().toLowerCase(),
          })),
        );
      } catch (error) {
        clientLogger.error("Failed to load organization chart", error);
        setError("The organizational chart is temporarily unavailable.");
      } finally {
        setLoading(false);
      }
    };

    void fetchOfficers();
  }, []);

  const getOfficer = (...roles: string[]) =>
    officers.find((officer) => roles.map((role) => role.toLowerCase()).includes(officer.role)) || null;
  const boardMembers = officers.filter((officer) => officer.role === "board_member");
  const currentSchoolYear = officers[0]?.schoolYear || null;

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border/60 bg-card p-3 shadow-sm md:rounded-2xl md:p-4"
      style={{
        backgroundImage: `linear-gradient(rgba(20,20,20,0.78), rgba(85,0,0,0.72)), url(${salayBackground})`,
        backgroundPosition: "center",
        backgroundSize: "cover",
      }}
    >
      <div className="relative z-10">
        <div className="mb-4 text-center md:mb-5">
          <h3 className="font-display text-sm font-bold text-white md:text-base">Alumni Association Officers</h3>
          <p className="mt-1 text-[9px] text-white/75 md:text-[10px]">
            {settings.institutionName} Alumni Association Officers{currentSchoolYear ? ` | ${currentSchoolYear}` : ""}
          </p>
          <div className="mx-auto mt-2 h-0.5 w-12 rounded-full bg-gold" />
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs font-medium text-white/80">Loading</div>
        ) : error ? (
          <div role="status" className="rounded-lg border border-white/20 bg-black/20 px-4 py-6 text-center text-xs font-medium text-white/80">{error}</div>
        ) : (
          <div className="overflow-hidden pb-2 md:overflow-x-auto md:pb-4">
            <div className="flex w-full min-w-0 flex-col items-center md:min-w-[600px]">
              <OfficerCard name={getOfficer("president")?.name || "TBA"} role="President" photo={getOfficer("president")?.photo} size="lg" accent="navy" textTone="light" />
              <VConn h={3} mdH={4} className="bg-white/35" />
              <OfficerCard name={getOfficer("vice_president")?.name || "TBA"} role="Vice President" photo={getOfficer("vice_president")?.photo} size="md" accent="blue" textTone="light" />
              <VConn h={3} mdH={4} className="bg-white/35" />
              <div className="grid w-full grid-cols-3 items-start gap-2 pt-2 md:flex md:w-auto md:gap-10 md:pt-3">
                <div className="flex flex-col items-center">
                  <OfficerCard name={getOfficer("secretary")?.name || "TBA"} role="Secretary" photo={getOfficer("secretary")?.photo} size="md" accent="emerald" textTone="light" />
                  <VConn h={2} mdH={3} className="bg-white/35" />
                  <OfficerCard name={getOfficer("assistant_secretary")?.name || "TBA"} role="Asst. Secretary" photo={getOfficer("assistant_secretary")?.photo} size="sm" accent="teal" textTone="light" />
                </div>
                <div className="flex flex-col items-center">
                  <OfficerCard name={getOfficer("treasurer")?.name || "TBA"} role="Treasurer" photo={getOfficer("treasurer")?.photo} size="md" accent="amber" textTone="light" />
                  <VConn h={2} mdH={3} className="bg-white/35" />
                  <OfficerCard name={getOfficer("assistant_treasurer")?.name || "TBA"} role="Asst. Treasurer" photo={getOfficer("assistant_treasurer")?.photo} size="sm" accent="orange" textTone="light" />
                </div>
                <OfficerCard name={getOfficer("auditor")?.name || "TBA"} role="Auditor" photo={getOfficer("auditor")?.photo} size="md" accent="orange" textTone="light" />
              </div>
              <div className="my-3 w-full max-w-xl border-t border-dashed border-white/30 md:my-4" />
              <OfficerCard name={getOfficer("pio", "pro")?.name || "TBA"} role="PRO" photo={getOfficer("pio", "pro")?.photo} size="md" accent="purple" textTone="light" />

              {boardMembers.length > 0 && (
                <>
                  <div className="my-3 w-full max-w-xl border-t border-dashed border-white/30 md:my-4" />
                  <div className="text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">Board Members</p>
                    <div className="mt-3 flex flex-wrap justify-center gap-2 md:gap-4">
                      {boardMembers.map((member) => (
                        <OfficerCard
                          key={`${member.role}-${member.name}`}
                          name={member.name}
                          role={member.positionLabel || "Board Member"}
                          photo={member.photo}
                          size="sm"
                          accent="slate"
                          textTone="light"
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}

              {officers.length === 0 && (
                <div className="rounded-lg border border-dashed border-white/30 bg-black/20 px-4 py-3 text-xs text-white/75">
                  No officer roster has been published yet.
                </div>
              )}
              {currentSchoolYear && (
                <div className="mt-4 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold text-white">
                  Active roster: {currentSchoolYear}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
