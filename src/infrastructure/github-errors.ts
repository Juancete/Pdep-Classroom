type RequestError = Error & { status: number };

export function isRequestError(error: unknown): error is RequestError {
  return error instanceof Error && "status" in error;
}

export function handleOctokitError(error: unknown): never {
  if (error instanceof Error) {
    if (error.message.includes("Invalid keyData")) {
      throw new Error(
        "GITHUB_APP_PRIVATE_KEY inválida: convertila con `cat key.pem | base64 | tr -d '\\n'`"
      );
    }
    if (error.message.includes("installationId option is required")) {
      throw new Error(
        "Falta GITHUB_APP_INSTALLATION_ID en las variables de entorno"
      );
    }
    if (error.message.includes("JSON web token could not be decoded")) {
      throw new Error(
        "GITHUB_APP_ID o GITHUB_APP_PRIVATE_KEY no coinciden: GitHub no pudo verificar el JWT"
      );
    }
  }

  if (isRequestError(error)) {
    if (error.status === 401) {
      throw new Error(
        "Autenticación fallida con GitHub (401): verificá GITHUB_APP_ID y GITHUB_APP_PRIVATE_KEY"
      );
    }
    if (error.status === 403) {
      throw new Error(
        "La GitHub App no tiene permisos suficientes (403): revisá los permisos en la configuración de la app"
      );
    }
    if (error.status === 404 && error.message.includes("access_tokens")) {
      throw new Error(
        "GITHUB_APP_INSTALLATION_ID incorrecto (404): verificá que la app esté instalada en la org"
      );
    }
    if (error.status === 404) {
      throw new Error(
        "Recurso no encontrado en GitHub (404): verificá GITHUB_ORG y que la app tenga acceso a los repos"
      );
    }
    if (error.status === 429) {
      throw new Error(
        "Rate limit de GitHub alcanzado (429): esperá unos minutos antes de reintentar"
      );
    }
  }

  throw error;
}
