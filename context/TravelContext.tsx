// context/TravelContext.tsx
import React, { createContext, ReactNode, useState } from "react";

export interface TravelData {
  // Champs principaux
  ville: string;
  dateDebut: Date | null;
  dateFin: Date | null;

  // Hébergement
  hotelType: string;
  hotelLocation: string;
  hotel: string;

  // Activités et style
  activityTypes: string[];
  voyageType: string;

  // Restauration
  cafeLevels: string[];
  cafe: string;

  // Budget
  budget: number | null;

  // Groupe & profil
  ageRange: string;
  emailInvites: string[];
  inviteCode: string | null;

  // Plan
  planCode: string;

  // Identifiants utilisateur
  userId: number | null;
  fullName?: string;

  // Pour le résumé (optionnel)
  resumeId: number | null;

  // Champs legacy
  cafeTypes: string[];
  activites: string[];
  emailInvite: string;
}

interface TravelContextType {
  travelData: TravelData;
  setTravelData: (data: Partial<TravelData>) => void;
  clearTravelData: () => void;
}

const TravelContext = createContext<TravelContextType | undefined>(undefined);

function generatePlanCode(): string {
  const hex = Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0"),
  )
    .join("")
    .toUpperCase();
  return `PL${hex}`;
}

function getDefaultTravelData(): TravelData {
  return {
    ville: "",
    dateDebut: null,
    dateFin: null,

    hotelType: "",
    hotelLocation: "",
    hotel: "",

    activityTypes: [],
    voyageType: "",

    cafeLevels: [],
    cafe: "",

    budget: null,

    ageRange: "",
    emailInvites: [],
    inviteCode: null,

    planCode: generatePlanCode(),

    userId: null,
    fullName: undefined,

    resumeId: null,

    cafeTypes: [],
    activites: [],
    emailInvite: "",
  };
}

export function TravelProvider({ children }: { children: ReactNode }) {
  const [travelData, setTravelDataState] =
    useState<TravelData>(getDefaultTravelData);

  const setTravelData = (data: Partial<TravelData>) => {
    setTravelDataState((prev) => ({ ...prev, ...data }));
  };

  const clearTravelData = () => {
    setTravelDataState(getDefaultTravelData());
  };

  return (
    <TravelContext.Provider
      value={{ travelData, setTravelData, clearTravelData }}
    >
      {children}
    </TravelContext.Provider>
  );
}

export function useTravelData() {
  const context = React.useContext(TravelContext);
  if (!context) {
    throw new Error("useTravelData must be used within a TravelProvider");
  }
  return context;
}
