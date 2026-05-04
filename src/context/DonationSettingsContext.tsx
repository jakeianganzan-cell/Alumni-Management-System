import { createContext, useContext, useState, ReactNode } from "react";

export interface GCashSettings {
  name: string;
  number: string;
  qr: string; // data URL or external URL
}

export interface PersonalSettings {
  personnel: string;
  contact: string;
  office: string;
}

interface DonationSettingsContextType {
  gcash: GCashSettings;
  personal: PersonalSettings;
  updateGCash: (s: Partial<GCashSettings>) => void;
  updatePersonal: (s: Partial<PersonalSettings>) => void;
}

const defaultGCash: GCashSettings = {
  name: "SaCC Alumni Foundation",
  number: "0917-XXX-XXXX",
  qr: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/QR_code_for_mobile_English_Wikipedia.svg/220px-QR_code_for_mobile_English_Wikipedia.svg.png",
};

const defaultPersonal: PersonalSettings = {
  personnel: "Ms. Jonalyn B. Flores",
  contact: "0917-888-0001",
  office: "Alumni Relations Office, Salay Community College, Salay, Misamis Oriental",
};

const DonationSettingsContext = createContext<DonationSettingsContextType>({
  gcash: defaultGCash,
  personal: defaultPersonal,
  updateGCash: () => { },
  updatePersonal: () => { },
});

export const useDonationSettings = () => useContext(DonationSettingsContext);

export function DonationSettingsProvider({ children }: { children: ReactNode }) {
  const [gcash, setGCash] = useState<GCashSettings>(defaultGCash);
  const [personal, setPersonal] = useState<PersonalSettings>(defaultPersonal);

  const updateGCash = (s: Partial<GCashSettings>) => setGCash(prev => ({ ...prev, ...s }));
  const updatePersonal = (s: Partial<PersonalSettings>) => setPersonal(prev => ({ ...prev, ...s }));

  return (
    <DonationSettingsContext.Provider value={{ gcash, personal, updateGCash, updatePersonal }}>
      {children}
    </DonationSettingsContext.Provider>
  );
}
