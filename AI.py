"""
ai.py
─────
Toute la logique de génération de plans de voyage :
  - Chargement des données JSON (hotels, cafes, activités, transport)
  - Filtrage selon les préférences clients (hotel_name et cafe_name prioritaires)
  - Résolution par majorité (mode groupe)
  - Construction du prompt Gemini
  - Génération via Gemini 2.5 Flash
  - Fallback local si Gemini indisponible
  - Déduplication : chaque activité n'apparaît qu'une seule fois par plan

CORRECTIONS :
  - Plus aucun "Tunis" hardcodé comme destination par défaut.
  - La destination est toujours déduite des données réelles.
  - Hôtel fallback : cherche dans une ville voisine si introuvable dans la ville demandée.
  - Café fallback : None si introuvable (pas de données inventées).
  - Suppression des FALLBACK_HOTELS / FALLBACK_CAFES génériques inventés.
"""

import json
import os
import re
import unicodedata
from collections import Counter
from datetime import datetime
from typing import Any

import google.generativeai as genai
# ──────────────────────────────────────────────────────────────
# CONFIG GEMINI
# ──────────────────────────────────────────────────────────────

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL   = "gemini-2.5-flash"

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    _gemini = genai.GenerativeModel(GEMINI_MODEL)
else:
    _gemini = None
    print("[ai.py] ⚠️  GEMINI_API_KEY manquante — mode fallback local activé.")

# ──────────────────────────────────────────────────────────────
# CONFIG DONNÉES
# ──────────────────────────────────────────────────────────────

DATA_DIR = "data"
JSON_FILES = {
    "hotels":     "hotels.json",
    "cafes":      "cafee.json",
    "activities": "activities.json",
    "transport":  "transport.json",
}

# Villes voisines pour le fallback hôtel (si ville demandée introuvable)
NEARBY_CITIES_FALLBACK: dict[str, list[str]] = {
    "tunis":    ["la marsa", "carthage", "ariana", "la goulette"],
    "sousse":   ["monastir", "mahdia", "msaken"],
    "sfax":     ["mahdia", "gabes", "el abassia"],
    "djerba":   ["zarzis", "gabes", "medenine"],
    "hammamet": ["nabeul", "kelibia", "grombalia"],
    "kairouan": ["sbeitla", "sousse", "sidi bouzid"],
    "bizerte":  ["tabarka", "mateur", "menzel bourguiba"],
    "tozeur":   ["nefta", "douz", "kebili"],
    "gabes":    ["matmata", "zarzis", "sfax"],
    "gabès":    ["matmata", "zarzis", "sfax"],
    "monastir": ["sousse", "mahdia", "msaken"],
    "nabeul":   ["hammamet", "kelibia", "tunis"],
    "tabarka":  ["bizerte", "ain draham", "jendouba"],
}

# Excursions par destination
NEARBY_EXCURSION_CITIES: dict[str, str] = {
    "tunis":     "Carthage",
    "sousse":    "Monastir",
    "hammamet":  "Nabeul",
    "sfax":      "Mahdia",
    "djerba":    "Zarzis",
    "kairouan":  "Sbeitla",
    "bizerte":   "Tabarka",
    "tozeur":    "Nefta",
    "gabès":     "Matmata",
    "gabes":     "Matmata",
}

EXCURSION_VOYAGE_TYPES = {"oui", "excursion", "aventure", "découverte", "explorer"}

LEISURE_KEYWORDS = re.compile(
    r"plage|beach|shopping|souk|hammam|spa|piscine|velo|vélo|randonnee|randonnée|"
    r"coucher.de.soleil|detente|détente|promenade|degustation|dégustation|"
    r"gastronomie|quad|snorkeling|surf|balade|loisir|divertissement",
    re.IGNORECASE,
)


def _is_excursion_requested(voyage_type: str) -> bool:
    t = _norm(voyage_type)
    return any(kw in t for kw in EXCURSION_VOYAGE_TYPES)


def _get_excursion_city(destination: str) -> str | None:
    if not destination:
        return None
    dest_norm = _norm(destination)
    for key, nearby in NEARBY_EXCURSION_CITIES.items():
        if key in dest_norm or dest_norm in key:
            return nearby
    return None


# ──────────────────────────────────────────────────────────────
# DÉDUPLICATION
# ──────────────────────────────────────────────────────────────

def _is_activity_already_mentioned(activity_name: str, existing_text: str) -> bool:
    if not activity_name or not existing_text:
        return False
    candidate = _norm(activity_name)
    text      = _norm(existing_text)
    if candidate in text:
        return True
    words = [w for w in candidate.split() if len(w) > 3]
    if not words:
        return False
    matches = sum(1 for w in words if w in text)
    return matches >= len(words) / 2 + 0.1


class LeisureScheduler:
    def __init__(self, activities: list[dict]):
        self._pool = [
            a for a in activities
            if LEISURE_KEYWORDS.search(a.get("name", ""))
        ]
        self._used: set[str] = set()

    def mark_used(self, activity_name: str) -> None:
        self._used.add(_norm(activity_name))

    def pick(self, existing_activity_text: str = "") -> dict | None:
        for activity in self._pool:
            k = _norm(activity.get("name", ""))
            if k in self._used:
                continue
            if existing_activity_text and _is_activity_already_mentioned(
                activity.get("name", ""), existing_activity_text
            ):
                continue
            self._used.add(k)
            return activity
        return None

    def remaining(self) -> int:
        return sum(
            1 for a in self._pool
            if _norm(a.get("name", "")) not in self._used
        )


def _build_excursion_day(
    destination: str,
    excursion_city: str,
    day_number: int,
) -> dict:
    city_data = get_city_data(excursion_city)
    if not city_data:
        city_data = {
            "hotels":     [],
            "cafes":      [],
            "activities": [],
            "transport":  f"Louage ou taxi depuis {destination} (~1h).",
            "meteo":      "Printemps et automne agréables.",
        }

    hotel = city_data["hotels"][0] if city_data["hotels"] else None
    cafe  = city_data["cafes"][0]  if city_data["cafes"]  else None
    acts  = city_data["activities"]
    act   = acts[0] if acts else {"name": f"Découverte de {excursion_city}", "prix": "Gratuit", "description": ""}

    transport_depuis = city_data.get("transport", f"Taxis et louages depuis {destination}.")
    transport_excursion = (
        f"Depuis {destination} : louage ou taxi vers {excursion_city} (~1h). "
        f"Sur place : {transport_depuis}"
    )

    programme = (
        f"Journée d'excursion à {excursion_city} depuis {destination}. "
        f"Départ en matinée par louage ou taxi. "
        f"Matin : {act['name']}. "
    )
    if cafe:
        programme += f"Pause café : {cafe['name']}. "
    programme += f"Retour à {destination} en soirée."

    scheduler = LeisureScheduler(acts)
    scheduler.mark_used(act["name"])
    loisir = scheduler.pick(programme)

    cafes_list = [cafe] if cafe else []

    if loisir:
        programme = (
            f"Journée d'excursion à {excursion_city} depuis {destination}. "
            f"Départ en matinée par louage ou taxi. "
            f"Matin : {act['name']}. "
        )
        if cafe:
            programme += f"Pause café : {cafe['name']}. "
        programme += (
            f"Après-midi : {loisir['name']}. "
            f"Retour à {destination} en soirée."
        )
        activites = [
            {
                "name": act["name"],
                "prix": act.get("prix", "Variable"),
                "description": act.get("description", ""),
                "type": "principale",
            },
            {
                "name": loisir["name"],
                "prix": loisir.get("prix", "Variable"),
                "description": loisir.get("description", ""),
                "type": "loisir",
            },
        ]
    else:
        activites = [
            {
                "name": act["name"],
                "prix": act.get("prix", "Variable"),
                "description": act.get("description", ""),
                "type": "principale",
            }
        ]

    return {
        "jour":             day_number,
        "excursion":        True,
        "ville_excursion":  excursion_city,
        "hotel":            hotel,
        "cafes":            cafes_list,
        "activites":        activites,
        "programme":        programme,
        "transport":        transport_excursion,
        "meteo_conseil":    city_data.get("meteo", "Agréable toute l'année."),
        "conseil":          f"Partez tôt depuis {destination} pour profiter pleinement de {excursion_city}. Retour en soirée.",
    }


# ──────────────────────────────────────────────────────────────
# 1. CHARGEMENT DES DONNÉES JSON
# ──────────────────────────────────────────────────────────────

_cache: dict = {}


def _normalize_cafe(entry: Any) -> dict:
    if not isinstance(entry, dict):
        return entry
    mapping = {"Nom": "name", "Prix": "prix", "Zone": "zone"}
    return {mapping.get(k, k.lower()): v for k, v in entry.items()}


def _normalize_activity(entry: Any) -> dict:
    if isinstance(entry, str):
        return {"name": entry, "prix": "Variable", "description": ""}
    if not isinstance(entry, dict):
        return entry
    mapping = {
        "Activité":    "name",
        "Prix_estimé": "prix",
        "Prix_estime": "prix",
        "prix_estimé": "prix",
    }
    normalized = {}
    for k, v in entry.items():
        normalized_key = mapping.get(k, k.lower())
        normalized[normalized_key] = v
    if "name" not in normalized:
        normalized["name"] = normalized.get("activite", normalized.get("activité", ""))
    return normalized


def _normalize_transport(entry: Any) -> dict:
    if isinstance(entry, str):
        return {"transport": entry, "meteo": "Printemps et automne agréables en Tunisie."}
    if not isinstance(entry, dict):
        return {"transport": "Taxis et louages disponibles.", "meteo": "Printemps et automne agréables en Tunisie."}
    if "moyens" in entry or "conseils" in entry:
        moyens   = entry.get("moyens", [])
        conseils = entry.get("conseils", "")
        prix     = entry.get("prix_moyens", {})
        moyens_str = ", ".join(moyens) if isinstance(moyens, list) else str(moyens)
        prix_str   = " | ".join(f"{k}: {v}" for k, v in prix.items()) if prix else ""
        transport_str = moyens_str
        if conseils:
            transport_str += f". {conseils}"
        if prix_str:
            transport_str += f" Prix : {prix_str}."
        return {
            "transport": transport_str,
            "meteo": entry.get("meteo", "Printemps et automne agréables en Tunisie."),
        }
    return {
        "transport": entry.get("transport", "Taxis et louages disponibles."),
        "meteo":     entry.get("meteo",     "Printemps et automne agréables en Tunisie."),
    }


def _load(key: str) -> dict:
    if key not in _cache:
        path = os.path.join(DATA_DIR, JSON_FILES[key])
        if not os.path.exists(path):
            print(f"[ai.py] ⚠️  Fichier manquant : {path}")
            _cache[key] = {}
        else:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                if key == "cafes":
                    data = {
                        ville: [_normalize_cafe(c) for c in liste]
                        for ville, liste in data.items()
                    }
                elif key == "activities":
                    data = {
                        ville: [_normalize_activity(a) for a in liste]
                        for ville, liste in data.items()
                    }
                elif key == "transport":
                    data = {
                        ville: _normalize_transport(entry)
                        for ville, entry in data.items()
                    }
            _cache[key] = data
    return _cache[key]


def _norm(s: str) -> str:
    if not s:
        return ""
    nfkd = unicodedata.normalize("NFD", s)
    return "".join(c for c in nfkd if unicodedata.category(c) != "Mn").lower().strip()


def _find_key(db: dict, ville: str):
    if not ville:
        return None
    if ville in db:
        return ville
    vn = _norm(ville)
    for k in db:
        if _norm(k) == vn:
            return k
    for k in db:
        kn = _norm(k)
        if vn in kn or kn in vn:
            return k
    return None


def _find_hotels_in_nearby_city(ville: str) -> list:
    """
    Cherche des hôtels réels dans une ville voisine si la ville demandée
    n'a pas d'hôtels dans les données. Ne retourne jamais de données inventées.
    """
    hotels_db = _load("hotels")
    ville_norm = _norm(ville)
    nearby_list = NEARBY_CITIES_FALLBACK.get(ville_norm, [])

    for nearby in nearby_list:
        hk = _find_key(hotels_db, nearby)
        if hk:
            hotels = hotels_db.get(hk, [])
            if hotels:
                print(f"[ai.py] ℹ️  Hôtels introuvables pour '{ville}', utilisation de la ville voisine '{hk}'.")
                return hotels

    # Dernier recours : parcourir toutes les villes connues et prendre la première avec des hôtels
    for k, v in hotels_db.items():
        if isinstance(v, list) and v:
            print(f"[ai.py] ℹ️  Hôtels introuvables pour '{ville}', utilisation de '{k}' comme fallback de dernière chance.")
            return v

    return []


def get_city_data(ville: str):
    """
    Retourne les données complètes pour une ville.
    - Hôtels : cherche dans la ville, sinon dans une ville voisine réelle (jamais inventé).
    - Cafés : retourne [] si introuvable (jamais de données inventées).
    - Retourne None uniquement si aucune donnée n'existe du tout.
    """
    if not ville or not ville.strip():
        return None

    hotels_db    = _load("hotels")
    cafes_db     = _load("cafes")
    acts_db      = _load("activities")
    transport_db = _load("transport")

    hk = _find_key(hotels_db, ville)
    ck = _find_key(cafes_db,  ville)
    ak = _find_key(acts_db,   ville)
    tk = _find_key(transport_db, ville)

    # Si aucune donnée trouvée du tout
    if not hk and not ck and not ak:
        return None

    city_name  = hk or ck or ak or ville

    # Hôtels : ville demandée ou ville voisine réelle
    if hk:
        hotels = hotels_db.get(hk, [])
    else:
        hotels = _find_hotels_in_nearby_city(ville)

    # Cafés : ville demandée uniquement, sinon liste vide (pas de données inventées)
    cafes = cafes_db.get(ck, []) if ck else []

    activities = acts_db.get(ak, []) if ak else []
    te         = transport_db.get(tk, {}) if tk else {}
    transport  = te.get("transport", "Taxis et louages disponibles.")
    meteo      = te.get("meteo",     "Printemps et automne agréables en Tunisie.")

    return {
        "original_name": city_name,
        "hotels":        hotels     if isinstance(hotels,     list) else [],
        "cafes":         cafes      if isinstance(cafes,      list) else [],
        "activities":    activities if isinstance(activities, list) else [],
        "transport":     transport,
        "meteo":         meteo,
    }


def list_cities():
    return sorted(_load("hotels").keys())


# ──────────────────────────────────────────────────────────────
# 2. RÉSOLUTION DESTINATION
# ──────────────────────────────────────────────────────────────

def resolve_destination(
    participants: list,
    villes: list[str] | None = None,
    fallback: str = "",
) -> str:
    """
    Détermine la destination principale sans jamais utiliser "Tunis" par défaut.

    Priorité :
      1. Majorité des champs `destination` dans les préférences participants
      2. Première ville de la liste `villes` fournie par l'appelant
      3. `fallback` fourni par l'appelant (lui-même issu des données réelles)
      4. Chaîne vide — jamais de valeur inventée
    """
    destinations = [
        p.get("destination", "")
        for p in participants
        if p.get("destination", "").strip()
    ]
    if destinations:
        maj = Counter(destinations).most_common(1)[0][0]
        if maj.strip():
            return maj

    if villes:
        for v in villes:
            if v and v.strip():
                return v

    if fallback and fallback.strip():
        return fallback

    return ""


def majority(values: list) -> Any:
    clean = [v for v in values if v]
    if not clean:
        return None
    return Counter(clean).most_common(1)[0][0]


def resolve_group_prefs(participants: list) -> dict:
    scalar_fields = [
        "hotel_type", "hotel_location", "cafe_style",
        "voyage_type", "hotel_name", "cafe_name",
        "tranche_age", "destination",
    ]
    resolved = {}
    for field in scalar_fields:
        values = []
        for p in participants:
            v = p.get(field)
            if not v and field == "cafe_style":
                v = p.get("cafe_levels")
            values.append(v)
        resolved[field] = majority(values)

    all_types = []
    for p in participants:
        val = p.get("activity_types")
        if isinstance(val, list):
            all_types.extend([v.strip() for v in val if v])
        elif isinstance(val, str) and val.strip():
            parts = [v.strip() for v in re.split(r"[,;]+", val) if v.strip()]
            all_types.extend(parts)
    resolved["activity_types"] = list(dict.fromkeys(all_types))

    budgets = []
    for p in participants:
        try:
            b = float(str(p.get("budget") or 0).replace(",", "."))
            if b > 0:
                budgets.append(b)
        except (ValueError, TypeError):
            pass
    resolved["budget_avg"] = round(sum(budgets) / len(budgets), 2) if budgets else 0.0

    return resolved


def resolve_dates(participants: list) -> dict:
    departures = [p.get("date_depart")  for p in participants if p.get("date_depart")]
    arrivals   = [p.get("date_arrivee") for p in participants if p.get("date_arrivee")]
    date_debut = majority(departures)
    date_fin   = majority(arrivals)
    num_days = 3
    if date_debut and date_fin:
        try:
            d0   = datetime.fromisoformat(date_debut).date()
            d1   = datetime.fromisoformat(date_fin).date()
            diff = (d1 - d0).days + 1
            if diff > 0:
                num_days = diff
        except ValueError:
            pass
    conflicts = []
    if len(set(departures)) > 1:
        conflicts.append(
            f"Départs multiples ({', '.join(set(departures))}) → retenu : {date_debut}"
        )
    if len(set(arrivals)) > 1:
        conflicts.append(
            f"Arrivées multiples ({', '.join(set(arrivals))}) → retenue : {date_fin}"
        )
    return {
        "date_debut":    date_debut,
        "date_fin":      date_fin,
        "num_days":      num_days,
        "conflict_info": " | ".join(conflicts) if conflicts else "Dates cohérentes",
    }


# ──────────────────────────────────────────────────────────────
# 3. FILTRAGE SELON PRÉFÉRENCES
# ──────────────────────────────────────────────────────────────

def _stars(hotel: dict) -> int:
    s = hotel.get("stars", "")
    n = sum(1 for c in s if c in ("⭐", "★", "*"))
    if n:
        return n
    m = re.search(r"(\d)", s)
    return int(m.group(1)) if m else 3


def _type_to_stars(hotel_type: str):
    t = _norm(hotel_type)
    if any(w in t for w in ("luxe", "5", "palace", "premium", "haut de gamme")): return 5
    if any(w in t for w in ("superior", "4", "confort", "standard")):             return 4
    if any(w in t for w in ("3", "moyen", "maison", "moderate")):                 return 3
    if any(w in t for w in ("eco", "budget", "2", "economique")):                 return 2
    return None


def _match_by_name(items: list, preferred_name: str) -> list:
    if not preferred_name or not items:
        return []

    pn = _norm(preferred_name)

    exact = [item for item in items if _norm(item.get("name", "")) == pn]
    if exact:
        return exact

    contains = [item for item in items if pn in _norm(item.get("name", ""))]
    if contains:
        return contains

    reverse = [item for item in items if _norm(item.get("name", "")) in pn]
    if reverse:
        return reverse

    pn_words = [w for w in pn.split() if len(w) > 3]
    if pn_words:
        word_match = [
            item for item in items
            if any(w in _norm(item.get("name", "")) for w in pn_words)
        ]
        if word_match:
            return word_match

    return []


def filter_hotels(
    hotels: list,
    hotel_type: str     = "",
    hotel_location: str = "",
    preferred_name: str = None,
) -> list:
    """
    Filtre les hôtels selon les préférences.
    Ne retourne jamais de données inventées : si `hotels` est vide, retourne [].
    """
    if not hotels:
        return []

    if preferred_name:
        matched = _match_by_name(hotels, preferred_name)
        if matched:
            remaining = [h for h in hotels if h not in matched]
            return matched + remaining

    candidates = hotels[:]
    target = _type_to_stars(hotel_type) if hotel_type else None
    if target:
        exact_s = [h for h in candidates if _stars(h) == target]
        if exact_s:
            candidates = exact_s
        else:
            loose = [h for h in candidates if abs(_stars(h) - target) <= 1]
            if loose:
                candidates = loose

    if hotel_location:
        loc = _norm(hotel_location)
        loc_filtered = [
            h for h in candidates
            if loc in _norm(h.get("description", "") + " " + h.get("address", ""))
        ]
        if loc_filtered:
            candidates = loc_filtered

    return candidates if candidates else hotels


def filter_cafes(
    cafes: list,
    cafe_style: str     = "",
    preferred_name: str = None,
) -> list:
    """
    Filtre les cafés selon les préférences.
    Retourne [] si la liste est vide (pas de données inventées).
    """
    if not cafes:
        return []

    if preferred_name:
        matched = _match_by_name(cafes, preferred_name)
        if matched:
            remaining = [c for c in cafes if c not in matched]
            return matched + remaining

    if not cafe_style:
        return cafes

    style      = _norm(cafe_style)
    is_premium = any(w in style for w in ("luxe", "chic", "haut", "premium"))
    is_budget  = any(w in style for w in ("eco", "simple", "populaire", "budget"))

    def _max_price(c: dict) -> int:
        nums = re.findall(r"\d+", c.get("prix", "0"))
        return max((int(x) for x in nums), default=0)

    if is_premium:
        filtered = [c for c in cafes if _max_price(c) >= 15]
        return filtered if filtered else cafes

    if is_budget:
        filtered = [c for c in cafes if _max_price(c) <= 10]
        return filtered if filtered else cafes

    return cafes


def filter_activities(
    activities: list,
    activity_types=None,
) -> list:
    if not activities:
        return []
    if not activity_types:
        return activities

    if isinstance(activity_types, str):
        activity_types = [activity_types]

    TYPE_KEYWORDS = {
        "cultur":   ["musee", "medina", "monument", "historique", "artisan", "patrimoine"],
        "histor":   ["musee", "medina", "monument", "historique", "artisan"],
        "plage":    ["plage", "mer", "baignade", "nautique", "cote"],
        "mer":      ["plage", "mer", "baignade", "nautique"],
        "sport":    ["sport", "randonnee", "velo", "surf", "escalade"],
        "aventure": ["randonnee", "escalade", "desert", "safari"],
        "gastr":    ["restaurant", "gastronomie", "cuisine", "marche", "food"],
        "food":     ["restaurant", "gastronomie", "cuisine", "marche"],
        "nature":   ["nature", "oasis", "desert", "foret", "parc", "jardin"],
        "desert":   ["desert", "oasis", "dunes", "sahara"],
        "relax":    ["hammam", "spa", "detente", "relaxation"],
        "spa":      ["hammam", "spa", "detente"],
        "shopping": ["souk", "bazar", "marche", "artisan", "boutique"],
        "famille":  ["parc", "zoo", "aquarium", "jardin", "animation"],
    }

    keywords = set()
    for t in activity_types:
        tn = _norm(t)
        for key, kws in TYPE_KEYWORDS.items():
            if key in tn:
                keywords.update(kws)

    if not keywords:
        return activities

    def _act_name(a: Any) -> str:
        return _norm(a if isinstance(a, str) else a.get("name", ""))

    filtered = [a for a in activities if any(kw in _act_name(a) for kw in keywords)]
    return filtered if filtered else activities


# ──────────────────────────────────────────────────────────────
# 4. CONSTRUCTION DU PROMPT GEMINI
# ──────────────────────────────────────────────────────────────

def _build_prompt(
    ville: str,
    days: int,
    hotels: list,
    cafes: list,
    activities: list,
    transport: str,
    meteo: str,
    prefs: dict,
    participants_ctx: str = "",
    dates_ctx: str = "",
) -> str:
    hotel_type     = prefs.get("hotel_type")     or "standard"
    hotel_location = prefs.get("hotel_location") or "bien situé"
    cafe_style     = prefs.get("cafe_style")     or "standard"
    activity_types = prefs.get("activity_types") or []
    voyage_type    = prefs.get("voyage_type")    or "découverte"
    budget_avg     = prefs.get("budget_avg", 0)
    tranche_age    = prefs.get("tranche_age")    or "adultes"

    hotel_name_pref = prefs.get("hotel_name") or ""
    cafe_name_pref  = prefs.get("cafe_name")  or ""

    excursion_city = _get_excursion_city(ville) if _is_excursion_requested(voyage_type) else None

    acts_str = (
        ", ".join(activity_types)
        if isinstance(activity_types, list)
        else str(activity_types)
    ) or "découverte générale"

    target_stars = _type_to_stars(hotel_type)
    stars_rule = (
        f'Type hôtel "{hotel_type}" = {target_stars}★ → choisis UNIQUEMENT des hôtels à {target_stars}★.'
        if target_stars
        else f'Adapte le choix de l\'hôtel au type "{hotel_type}".'
    )

    budget_rule = (
        f"Budget moyen : {budget_avg:.0f} TND/jour — adapte les recommandations en conséquence."
        if budget_avg > 0
        else "Budget non précisé — propose des options variées."
    )

    excursion_rule = ""
    if excursion_city:
        excursion_rule = f"""
9. Le DERNIER jour (jour {days}) est une EXCURSION à {excursion_city} depuis {ville}.
   - Utilise les données de {excursion_city} pour les activités et cafés de ce jour.
   - Décris le transport aller-retour (louage, bus, taxi, durée, prix).
   - Programme : départ matin, activités sur place, retour en soirée.
   - Ce jour doit contenir : un café (si disponible), une activité principale ET un loisir local DISTINCTS.
   - IMPORTANT : le loisir local doit être DIFFÉRENT de l'activité principale.
"""

    hotel_name_rule = ""
    if hotel_name_pref:
        matched_hotels = _match_by_name(hotels, hotel_name_pref)
        if matched_hotels:
            hotel_name_rule = (
                f'\n⚠️  OBLIGATION ABSOLUE — HÔTEL : L\'utilisateur a explicitement demandé l\'hôtel '
                f'"{hotel_name_pref}". L\'hôtel "{matched_hotels[0].get("name", hotel_name_pref)}" '
                f'EST DISPONIBLE dans la liste ci-dessus. Tu DOIS utiliser CET HÔTEL EXACT pour '
                f'TOUS les jours du séjour sans exception. Ne choisis AUCUN autre hôtel.'
            )
        else:
            hotel_name_rule = (
                f'\n⚠️  OBLIGATION ABSOLUE — HÔTEL : L\'utilisateur a demandé l\'hôtel '
                f'"{hotel_name_pref}". Bien qu\'il ne soit pas dans la liste locale, '
                f'mentionne-le dans le programme et choisis l\'hôtel de la liste qui s\'en '
                f'rapproche le plus (nom, étoiles, localisation).'
            )

    cafe_name_rule = ""
    if cafe_name_pref:
        if cafes:
            matched_cafes = _match_by_name(cafes, cafe_name_pref)
            if matched_cafes:
                cafe_name_rule = (
                    f'\n⚠️  OBLIGATION ABSOLUE — CAFÉ : L\'utilisateur a explicitement demandé le café '
                    f'"{cafe_name_pref}". Le café "{matched_cafes[0].get("name", cafe_name_pref)}" '
                    f'EST DISPONIBLE dans la liste ci-dessus. Tu DOIS inclure CE CAFÉ au Jour 1 '
                    f'et le réutiliser autant que possible sur les autres jours. '
                    f'Ne choisis pas d\'autre café si celui-ci est disponible.'
                )
            else:
                cafe_name_rule = (
                    f'\n⚠️  NOTE CAFÉ : L\'utilisateur a demandé le café "{cafe_name_pref}" '
                    f'mais il n\'est pas dans la liste locale. Mentionne-le si possible '
                    f'ou choisis le café le plus proche disponible.'
                )
        else:
            cafe_name_rule = (
                f'\n⚠️  NOTE CAFÉ : L\'utilisateur a demandé le café "{cafe_name_pref}" '
                f'mais AUCUN café n\'est disponible dans les données pour {ville}. '
                f'Ne pas inclure de café dans le plan — mettre cafes: [].'
            )

    cafes_section = (
        f"CAFÉS DISPONIBLES ({len(cafes)}) :\n{json.dumps(cafes[:10], ensure_ascii=False, indent=2)}"
        if cafes
        else f"CAFÉS : Aucun café référencé pour {ville} — ne pas inclure de café dans le plan (cafes: [])."
    )

    return f"""Tu es un expert en voyages touristiques en Tunisie.

═══ CONTEXTE DU VOYAGE ═══
Ville       : {ville}
Durée       : {days} jour(s)
Type voyage : {voyage_type}
Tranche âge : {tranche_age}
{dates_ctx}
{participants_ctx}

═══ PRÉFÉRENCES CLIENTS (À RESPECTER STRICTEMENT) ═══
Hôtel type         : {hotel_type}
Hôtel localisation : {hotel_location}
Hôtel nom demandé  : {hotel_name_pref or "Aucun (choisir selon type/localisation)"}
Café style         : {cafe_style}
Café nom demandé   : {cafe_name_pref or "Aucun (choisir selon style)"}
Types d'activités  : {acts_str}
{budget_rule}

═══ DONNÉES LOCALES (UTILISER UNIQUEMENT CES ÉLÉMENTS) ═══

HÔTELS DISPONIBLES ({len(hotels)}) :
{json.dumps(hotels[:15], ensure_ascii=False, indent=2)}

{cafes_section}

ACTIVITÉS DISPONIBLES ({len(activities)}) :
{json.dumps(activities[:20], ensure_ascii=False, indent=2)}

TRANSPORT : {transport}
MÉTÉO     : {meteo}

═══ RÈGLES STRICTES ═══
1. Utilise UNIQUEMENT les hôtels, cafés et activités listés — NE PAS en inventer d'autres.
2. {stars_rule}
3. Hôtel situé "{hotel_location}" — vérifie la description/adresse.
4. Si des cafés sont listés : café style "{cafe_style}" — respecte le niveau de prix.
   Si AUCUN café n'est listé : mettre "cafes": [] pour chaque jour.
5. Activités correspondant à "{acts_str}".
6. Programme du jour : 2 à 3 activités cohérentes, adaptées à la tranche d'âge et au type de voyage.
7. Si des cafés sont disponibles : 1 à 2 cafés par jour, en rotation sur les {days} jours.
8. Génère EXACTEMENT {days} entrées dans "plan".
{excursion_rule}{hotel_name_rule}{cafe_name_rule}
10. Ville unique → même hôtel tous les jours.
11. Chaque "programme" : 3 à 5 phrases avec noms, horaires, prix, conseils pratiques.
12. Chaque jour doit avoir UNE activité principale (culturelle) et UN loisir local DISTINCTS.
13. ⚠️  ANTI-DOUBLON STRICT : l'activité principale et le loisir local DOIVENT être deux activités DIFFÉRENTES.

═══ FORMAT DE RÉPONSE (JSON UNIQUEMENT, SANS MARKDOWN) ═══
{{
  "conseil_global": "Conseil personnalisé 2-3 phrases pour {ville} selon le profil",
  "plan": [
    {{
      "jour": 1,
      "hotel": {{
        "name": "Nom exact issu de la liste",
        "stars": "⭐⭐⭐",
        "description": "description"
      }},
      "cafes": [],
      "activites": [
        {{"name": "Activité principale", "prix": "Prix_estimé", "type": "principale"}},
        {{"name": "Loisir local DIFFÉRENT", "prix": "Prix_estimé", "type": "loisir"}}
      ],
      "programme": "Programme détaillé du jour (3-5 phrases).",
      "transport": "Conseil transport du jour",
      "meteo_conseil": "Conseil météo actionnable"
    }}
  ]
}}"""


# ──────────────────────────────────────────────────────────────
# 5. GÉNÉRATION VIA GEMINI
# ──────────────────────────────────────────────────────────────

def _deduplicate_day_activities(day: dict) -> dict:
    activites = day.get("activites", [])
    if len(activites) < 2:
        return day

    principale = next((a for a in activites if a.get("type") == "principale"), None)
    loisir     = next((a for a in activites if a.get("type") == "loisir"),     None)

    if not principale or not loisir:
        return day

    if _is_activity_already_mentioned(loisir.get("name", ""), principale.get("name", "")):
        day["activites"] = [principale]
        return day

    return day


def generate_plan_gemini(
    ville: str,
    days: int,
    hotels: list,
    cafes: list,
    activities: list,
    transport: str,
    meteo: str,
    prefs: dict,
    participants_ctx: str = "",
    dates_ctx: str = "",
) -> dict:
    if _gemini is None:
        raise RuntimeError("Gemini non configuré (GEMINI_API_KEY manquante).")

    prompt = _build_prompt(
        ville=ville, days=days,
        hotels=hotels, cafes=cafes, activities=activities,
        transport=transport, meteo=meteo, prefs=prefs,
        participants_ctx=participants_ctx, dates_ctx=dates_ctx,
    )

    response = _gemini.generate_content(
        prompt,
        generation_config={"response_mime_type": "application/json"},
    )

    raw = response.text.strip()
    raw = re.sub(r"^```json\s*", "", raw)
    raw = re.sub(r"^```\s*",     "", raw)
    raw = re.sub(r"\s*```$",     "", raw)
    raw = raw.strip()

    result = json.loads(raw)

    if "plan" not in result or not isinstance(result["plan"], list) or len(result["plan"]) == 0:
        raise ValueError("Réponse Gemini invalide : champ 'plan' manquant ou vide.")

    # ── POST-TRAITEMENT 1 : vérification hotel_name / cafe_name ──────────
    hotel_name_pref = prefs.get("hotel_name") or ""
    cafe_name_pref  = prefs.get("cafe_name")  or ""

    if hotel_name_pref and hotels:
        matched_hotels = _match_by_name(hotels, hotel_name_pref)
        if matched_hotels:
            forced_hotel = matched_hotels[0]
            for day in result["plan"]:
                if not day.get("excursion"):
                    day["hotel"] = forced_hotel

    if cafe_name_pref and cafes:
        matched_cafes = _match_by_name(cafes, cafe_name_pref)
        if matched_cafes:
            forced_cafe = matched_cafes[0]
            for idx, day in enumerate(result["plan"]):
                if not day.get("excursion"):
                    if idx == 0 or idx % 2 == 0:
                        day["cafes"] = [forced_cafe] + [
                            c for c in day.get("cafes", [])
                            if c.get("name") != forced_cafe.get("name")
                        ]

    # Si pas de cafés disponibles, vider les cafés de chaque jour
    if not cafes:
        for day in result["plan"]:
            if not day.get("excursion"):
                day["cafes"] = []

    # ── POST-TRAITEMENT 2 : DÉDUPLICATION ───────────────────────────────
    global_scheduler = LeisureScheduler(activities)

    for day in result["plan"]:
        if day.get("excursion"):
            continue

        day = _deduplicate_day_activities(day)

        activites  = day.get("activites", [])
        principale = next((a for a in activites if a.get("type") == "principale"), None)
        loisir     = next((a for a in activites if a.get("type") == "loisir"),     None)
        programme  = day.get("programme", "")

        if principale:
            global_scheduler.mark_used(principale.get("name", ""))

        if loisir:
            loisir_key = _norm(loisir.get("name", ""))
            if loisir_key in global_scheduler._used:
                replacement = global_scheduler.pick(programme)
                if replacement:
                    day["activites"] = [
                        a if a.get("type") != "loisir" else replacement
                        for a in activites
                    ]
                else:
                    day["activites"] = [a for a in activites if a.get("type") != "loisir"]
            else:
                global_scheduler.mark_used(loisir.get("name", ""))

    return result


# ──────────────────────────────────────────────────────────────
# 6. FALLBACK LOCAL (SANS GEMINI)
# ──────────────────────────────────────────────────────────────

def generate_plan_fallback(
    ville: str,
    days: int,
    hotels: list,
    cafes: list,
    activities: list,
    transport: str,
    meteo: str,
    prefs: dict,
) -> dict:
    """
    Génère un plan local sans Gemini.
    - `ville` : destination réelle, jamais substituée par une autre.
    - Hôtels : issus des données réelles (potentiellement d'une ville voisine).
    - Cafés : [] si aucun disponible dans les données (pas de données inventées).
    """
    hotel_name_pref = prefs.get("hotel_name") or ""
    cafe_name_pref  = prefs.get("cafe_name")  or ""

    # ── Sélection hôtel ──────────────────────────────────────────────────
    if not hotels:
        chosen_hotel = None
        print(f"[ai.py] ⚠️  Aucun hôtel trouvé pour '{ville}' ni dans les villes voisines.")
    elif hotel_name_pref:
        matched_hotels = _match_by_name(hotels, hotel_name_pref)
        if matched_hotels:
            chosen_hotel = matched_hotels[0]
            print(f"[ai.py] ✅ Hôtel prioritaire trouvé : {chosen_hotel.get('name')}")
        else:
            chosen_hotel = hotels[0]
            print(f"[ai.py] ⚠️  Hôtel '{hotel_name_pref}' non trouvé → fallback : {chosen_hotel.get('name')}")
    else:
        chosen_hotel = hotels[0]

    # ── Sélection café prioritaire ────────────────────────────────────────
    priority_cafe = None
    if cafe_name_pref and cafes:
        matched_cafes = _match_by_name(cafes, cafe_name_pref)
        if matched_cafes:
            priority_cafe = matched_cafes[0]
            print(f"[ai.py] ✅ Café prioritaire trouvé : {priority_cafe.get('name')}")
        else:
            print(f"[ai.py] ⚠️  Café '{cafe_name_pref}' non trouvé dans les données")

    def _to_dict(a: Any) -> dict:
        if isinstance(a, str):
            return {"name": a, "prix": "Variable", "description": ""}
        return a

    leisure_scheduler = LeisureScheduler(activities)

    plan_days = []
    for i in range(days):
        # ── Café du jour ───────────────────────────────────────────────────
        if not cafes:
            # Aucun café dans les données → ne pas en afficher
            day_cafes = []
        elif priority_cafe:
            if i == 0 or i % 2 == 0:
                day_cafes = [priority_cafe]
            else:
                other_cafes = [c for c in cafes if c.get("name") != priority_cafe.get("name")]
                if other_cafes:
                    day_cafes = [other_cafes[(i - 1) % len(other_cafes)]]
                else:
                    day_cafes = [priority_cafe]
        else:
            day_cafes = [cafes[i % len(cafes)]]

        if activities:
            offset = (i * 2) % len(activities)
            act    = _to_dict(activities[offset])

            programme = f"Journée à {ville} : Matin : {act['name']}. "
            if day_cafes:
                programme += f"Café : {day_cafes[0]['name']}."

            leisure_scheduler.mark_used(act["name"])
            loisir = leisure_scheduler.pick(programme)

            if loisir:
                programme += f" Après-midi : {loisir['name']}."
                programme += f" {transport} Météo : {meteo}."
                day_acts = [
                    {**act,    "type": "principale"},
                    {**loisir, "type": "loisir"},
                ]
            else:
                programme += f" {transport} Météo : {meteo}."
                day_acts = [
                    {**act, "type": "principale"},
                ]
        else:
            day_acts  = []
            programme = (
                f"Exploration libre de {ville} : sites emblématiques, "
                f"gastronomie locale et immersion culturelle. {transport}"
            )

        day_entry = {
            "jour":          i + 1,
            "hotel":         chosen_hotel,
            "cafes":         day_cafes,
            "activites":     day_acts,
            "programme":     programme,
            "transport":     transport,
            "meteo_conseil": meteo,
        }
        # Supprimer hotel si None (pas de données)
        if chosen_hotel is None:
            day_entry.pop("hotel", None)

        plan_days.append(day_entry)

    # ── Injection excursion si demandée ──────────────────────────────────
    voyage_type = prefs.get("voyage_type", "")
    budget_info = ""
    if _is_excursion_requested(voyage_type):
        excursion_city = _get_excursion_city(ville)
        if excursion_city and plan_days:
            excursion_day = _build_excursion_day(
                destination=ville,
                excursion_city=excursion_city,
                day_number=len(plan_days) // 2 + 1,
            )
            insert_at = len(plan_days) // 2
            plan_days[insert_at] = excursion_day
            budget_info = f" dont excursion à {excursion_city}"

    hotel_info = f" · Hôtel : {chosen_hotel.get('name', '')}" if (hotel_name_pref and chosen_hotel) else ""
    cafe_info  = f" · Café : {priority_cafe.get('name', '')}" if priority_cafe else ""

    conseil = f"Plan généré localement pour {ville}{budget_info}{hotel_info}{cafe_info}."
    if not cafes:
        conseil += f" Aucun café référencé pour {ville} dans les données."
    if not _gemini:
        conseil += " ⚠️ Gemini indisponible."

    return {
        "conseil_global": conseil,
        "plan":  plan_days,
        "model": "fallback_local",
    }


# ──────────────────────────────────────────────────────────────
# 7. POINT D'ENTRÉE PRINCIPAL
# ──────────────────────────────────────────────────────────────

def generate_plan(
    participants: list,
    villes: list[str] | None = None,
    days: int | None = None,
) -> dict:
    """
    Point d'entrée principal.

    `villes` : liste des villes demandées par l'appelant.
    `participants` : liste de dicts avec les préférences de chaque voyageur.

    La destination est toujours résolue depuis les données réelles.
    Jamais de "Tunis" par défaut.
    """
    prefs = resolve_group_prefs(participants)
    dates = resolve_dates(participants)

    ville = resolve_destination(participants, villes)

    if not ville:
        known = list_cities()
        ville = known[0] if known else ""

    if not ville:
        return {
            "error": "Aucune destination trouvée. Veuillez préciser une ville.",
            "plan": [],
        }

    num_days = days if days and days > 0 else dates.get("num_days", 3)

    city_data = get_city_data(ville)
    if not city_data:
        return {
            "error": f"Ville '{ville}' non trouvée dans les données.",
            "plan": [],
        }

    hotels     = filter_hotels(city_data["hotels"], prefs.get("hotel_type", ""), prefs.get("hotel_location", ""), prefs.get("hotel_name"))
    cafes      = filter_cafes(city_data["cafes"],   prefs.get("cafe_style", ""), prefs.get("cafe_name"))
    activities = filter_activities(city_data["activities"], prefs.get("activity_types"))
    transport  = city_data["transport"]
    meteo      = city_data["meteo"]

    dates_ctx = ""
    if dates.get("date_debut") or dates.get("date_fin"):
        dates_ctx = f"Dates : {dates.get('date_debut', '?')} → {dates.get('date_fin', '?')} ({num_days} jours)"

    participants_ctx = "\n".join(
        f"- {p.get('role', 'voyageur')} : {p.get('full_name') or p.get('email', '')}"
        for p in participants
    )

    try:
        result = generate_plan_gemini(
            ville=ville, days=num_days,
            hotels=hotels, cafes=cafes, activities=activities,
            transport=transport, meteo=meteo, prefs=prefs,
            participants_ctx=participants_ctx, dates_ctx=dates_ctx,
        )
        result["model"] = "gemini"
        result["resolved_destination"] = ville
        result["resolved_dates"] = dates
        return result
    except Exception as e:
        print(f"[ai.py] ⚠️ Gemini indisponible ({e}), fallback local.")
        result = generate_plan_fallback(
            ville=ville, days=num_days,
            hotels=hotels, cafes=cafes, activities=activities,
            transport=transport, meteo=meteo, prefs=prefs,
        )
        result["resolved_destination"] = ville
        result["resolved_dates"] = dates
        return result