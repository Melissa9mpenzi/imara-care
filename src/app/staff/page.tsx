import StaffDirectory from "@/app/staff/staff-directory";
import { getFacilityStaff, requireStaffManager } from "@/lib/staff-directory";

export default async function StaffPage() {
  const facilityId = await requireStaffManager();
  const staff = await getFacilityStaff(facilityId);
  return <StaffDirectory staff={staff} />;
}
