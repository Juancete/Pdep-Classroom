"use client";

import { useSyncExternalStore } from "react";
import { contadorDeErroresSinLeer } from "./contador-de-errores-sin-leer";

const sinSuscripcion = () => () => {};

// Para quien no administra no se suscribe: el store no hace ningún pedido.
export function useErrorLogCount(enabled: boolean): number {
  return useSyncExternalStore(
    enabled ? contadorDeErroresSinLeer.suscribir : sinSuscripcion,
    () => (enabled ? contadorDeErroresSinLeer.leer() : 0),
    () => 0
  );
}
