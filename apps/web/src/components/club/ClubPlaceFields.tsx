"use client";
import { useState } from "react";
import { TextField } from "@/components/ui/TextField";
import { PlaceField, type PlaceValue } from "@/components/onboarding/PlaceField";

export type ClubPlaceLabels = {
  address: string;
  addressPlaceholder: string;
  city: string;
  postcode: string;
  noResult: string;
  offline: string;
};

type Initial = { address: string | null; city: string | null; postcode: string | null; lat: number | null; lng: number | null };

/**
 * Address with suggestions (IGN, through /api/geocode): picking one fills the
 * city, postcode and map position; typing freely keeps the text and drops the
 * position, which would no longer match.
 */
export function ClubPlaceFields({ initial, labels, disabled }: { initial: Initial; labels: ClubPlaceLabels; disabled?: boolean }) {
  const [place, setPlace] = useState<PlaceValue>({ text: initial.address ?? "", lat: initial.lat ?? undefined, lng: initial.lng ?? undefined });
  const [city, setCity] = useState(initial.city ?? "");
  const [postcode, setPostcode] = useState(initial.postcode ?? "");

  function onPlace(v: PlaceValue) {
    setPlace(v);
    if (v.lat !== undefined) {
      if (v.city) setCity(v.city);
      if (v.postcode) setPostcode(v.postcode);
    }
  }

  return (
    <>
      <input type="hidden" name="address" value={place.text} />
      <input type="hidden" name="lat" value={place.lat ?? ""} />
      <input type="hidden" name="lng" value={place.lng ?? ""} />
      {disabled ? (
        <TextField id="club-address" label={labels.address} value={place.text} disabled readOnly />
      ) : (
        <PlaceField
          id="club-address"
          kind="address"
          label={labels.address}
          placeholder={labels.addressPlaceholder}
          value={place}
          onChange={onPlace}
          noResultText={labels.noResult}
          offlineText={labels.offline}
        />
      )}
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <TextField id="club-city" name="city" label={labels.city} value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} autoComplete="address-level2" disabled={disabled} />
        <TextField
          id="club-postcode"
          name="postcode"
          label={labels.postcode}
          value={postcode}
          onChange={(e) => setPostcode(e.target.value)}
          maxLength={10}
          inputMode="numeric"
          autoComplete="postal-code"
          disabled={disabled}
        />
      </div>
    </>
  );
}
