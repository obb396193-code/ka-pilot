/** Reject development-only data settings before parsing or using production credentials. */
export function assertProductionEnvironment(environment: NodeJS.ProcessEnv): void {
  if (environment.NODE_ENV === "production" &&
    Object.keys(environment).some((key) => key.startsWith("KA_DATA_DEV_"))) {
    throw new Error("Development data configuration is forbidden in production");
  }
}
