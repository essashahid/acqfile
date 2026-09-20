import { recipientData } from "@/lib/portal/service";
import { uploadResult } from "@/lib/portal/upload";
import { Shell } from "@/components/portal/Shell";
import { Receipt } from "@/components/portal/Receipt";
import { notFound } from "next/navigation";
export default async function UploadPage({
  params,
}: {
  params: Promise<{ token: string; receipt: string }>;
}) {
  const { token, receipt } = await params,
    p = await recipientData(token);
  let result;
  try {
    result = await uploadResult(p, receipt);
  } catch {
    notFound();
  }
  return (
    <Shell
      firm={p.workspace.firmName}
      contact={p.deal.contactName}
      email={p.deal.contactEmail}
      stages={p.home.stages}
      home={`/p/${token}`}
    >
      <Receipt initial={result} base={`/p/${token}`} first={p.home.first} />
    </Shell>
  );
}
