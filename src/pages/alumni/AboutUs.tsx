import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import AlumniLayout from "@/components/alumni/AlumniLayout";
import OrganizationChart from "@/components/alumni/OrganizationChart";
import {
  AboutPageSkeleton,
  AlumniFeatures,
  CollegeLeadership,
  ContactAndSocial,
  InstitutionalHero,
  InstitutionalHistory,
  InstitutionIdentity,
  InstitutionLeadershipHierarchy,
  InstitutionOverview,
  InstitutionServices,
  RecognitionMilestones,
} from "@/components/alumni/about/AboutSections";
import { useSystemSettings } from "@/context/SystemSettingsContext";
import { fetchAboutPageData, type AboutPageData } from "@/lib/about";
import { INSTITUTION_OFFICIAL_CATEGORY } from "@/lib/institutionOfficials";

export default function AboutUs() {
  const location = useLocation();
  const { settings, loading: settingsLoading } = useSystemSettings();
  const [aboutData, setAboutData] = useState<AboutPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetchAboutPageData(controller.signal)
      .then((data) => {
        setAboutData(data);
        setError("");
      })
      .catch((fetchError) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setError("Some optional institutional sections are temporarily unavailable.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const pageSettings = aboutData?.institution || settings;
  const leadership = aboutData?.leadership || [];
  const otherLeadership = leadership.filter((entry) => entry.category !== INSTITUTION_OFFICIAL_CATEGORY);
  const activePage = location.pathname.endsWith("/academics-alumni") ? "academics-alumni" : "institution";
  const pageTitle = activePage === "institution" ? "Institution" : "Academics & Alumni";

  return (
    <AlumniLayout title={`About Us - ${pageTitle}`} subtitle={pageSettings.systemShortName}>
      <main className="mx-auto max-w-6xl space-y-4 pb-4 md:space-y-6">
        {(loading || settingsLoading) && !aboutData ? (
          <AboutPageSkeleton />
        ) : (
          <>
            <InstitutionalHero settings={pageSettings} />
            {error && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">{error}</div>}

            {activePage === "institution" ? (
              <>
                <InstitutionLeadershipHierarchy entries={leadership} />
                <div className="space-y-2">
                  <InstitutionOverview settings={pageSettings} />
                  <InstitutionIdentity settings={pageSettings} />
                </div>
                <InstitutionalHistory entries={aboutData?.history || []} fallback={pageSettings.history} />
                <RecognitionMilestones entries={aboutData?.milestones || []} />
                <CollegeLeadership entries={otherLeadership} />
                <InstitutionServices entries={aboutData?.services || []} />
                <ContactAndSocial settings={pageSettings} />
              </>
            ) : (
              <>
                <section>
                  <OrganizationChart />
                </section>

                <AlumniFeatures />
              </>
            )}

            <footer className="border-t border-border pt-5 text-center text-[10px] leading-5 text-muted-foreground md:text-[11px]">
              <p>{pageSettings.footerCopyrightText || `© ${new Date().getFullYear()} ${pageSettings.institutionName}`}</p>
              <p>{pageSettings.systemName}</p>
            </footer>
          </>
        )}
      </main>
    </AlumniLayout>
  );
}
