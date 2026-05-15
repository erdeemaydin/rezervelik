import { redirect } from 'next/navigation';

export default function SystemAdminIndex() {
  redirect('/system-admin/tenants');
}
