export type PublicUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

let currentUser: PublicUser | null = null;

export function setCurrentUser(user: PublicUser | null) {
  currentUser = user;
}

export function getCurrentUser() {
  return currentUser;
}
