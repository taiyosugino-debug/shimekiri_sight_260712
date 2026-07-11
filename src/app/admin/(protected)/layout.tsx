'use client';

import AdminShell from '@/components/admin/AdminShell';

// 認可は middleware（/admin/:path* を保護）に任せる。ここではシェルの見た目だけを提供する。
export default function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
