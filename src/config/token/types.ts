import type { UserRole } from '../../modules/users/schemas/enums/user-role';

export interface RefreshTokenPayload {
  id: string;
  role: UserRole;
  isActive: boolean;
}
