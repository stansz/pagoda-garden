"use strict";

/** The three manual states, expressed as WMO codes so both paths read the same. */
function wxToCode(kind){ return kind === "rain" ? 61 : kind === "snow" ? 71 : 0; }

function condLabel(code){
  if(code === 0) return "Clear sky";
  if(code <= 2) return "Partly cloudy";
  if(code === 3) return "Overcast";
  if(code === 45 || code === 48) return "Fog";
  if(code >= 51 && code <= 57) return "Drizzle";
  if(code >= 61 && code <= 67) return "Rain";
  if(code >= 71 && code <= 77) return "Snow";
  if(code >= 80 && code <= 82) return "Showers";
  if(code === 85 || code === 86) return "Snow showers";
  if(code >= 95) return "Thunderstorm";
  return "—";
}
