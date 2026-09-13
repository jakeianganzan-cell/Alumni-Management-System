import bcrypt from "bcrypt";

export const isLoginInputWithinLimits = (identifier: string, password: string) =>
  Boolean(identifier && password && identifier.length <= 254 && password.length <= 128);

export const verifyLoginPassword = (password: string, passwordHash: string) =>
  bcrypt.compare(password, passwordHash);

export const isRoleAssigned = (roles: readonly string[], selectedRole: string) =>
  Boolean(selectedRole && roles.includes(selectedRole));
