import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';

const poolData = {
  UserPoolId: import.meta.env.VITE_USER_POOL_ID as string,
  ClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID as string,
};

const userPool = new CognitoUserPool(poolData);

export interface AuthUser {
  sub: string;
  email: string;
  token: string;
}

export function getCurrentSession(): Promise<CognitoUserSession | null> {
  return new Promise((resolve) => {
    const user = userPool.getCurrentUser();
    if (!user) return resolve(null);
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session?.isValid()) return resolve(null);
      resolve(session);
    });
  });
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await getCurrentSession();
  if (!session) return null;
  const payload = session.getIdToken().decodePayload();
  return {
    sub: payload['sub'],
    email: payload['email'],
    token: session.getIdToken().getJwtToken(),
  };
}

export function signUp(email: string, password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const attrs = [new CognitoUserAttribute({ Name: 'email', Value: email })];
    userPool.signUp(email, password, attrs, [], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export function confirmSignUp(email: string, code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    user.confirmRegistration(code, true, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export function signIn(email: string, password: string): Promise<AuthUser> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });
    user.authenticateUser(authDetails, {
      onSuccess(session) {
        const payload = session.getIdToken().decodePayload();
        resolve({
          sub: payload['sub'],
          email: payload['email'],
          token: session.getIdToken().getJwtToken(),
        });
      },
      onFailure: reject,
    });
  });
}

export function signOut(): void {
  userPool.getCurrentUser()?.signOut();
}
