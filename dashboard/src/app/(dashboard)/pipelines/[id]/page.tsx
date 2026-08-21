"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Play,
  Square,
  Trash2,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Info,
} from "lucide-react";

import {
  useProcessors,
  useStartAll,
  useStopAll,
  useStartProcessor,
  useStopProcessor,
  useRemoveProcessor,
} from "@/lib/nifi/hooks";
import type { Processor, ProcessorRunStatus } from "@/lib/nifi/types";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useProcessorDiagnostics } from "@/lib/nifi/hooks";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ConnectionsTab, ParametersTab, ServicesTab } from "./tabs";
import { AddProcessorDialog } from "@/components/add-processor-dialog";
import { EditProcessorDialog } from "@/components/edit-processor-dialog";
import { Settings } from "lucide-react";

function ProcStatusBadge({ status }: { status: ProcessorRunStatus }) {
  const map: Record<ProcessorRunStatus, string> = {
    RUNNING: "bg-green-500/15 text-green-600 dark:text-green-400",
    STOPPED: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
    DISABLED: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    INVALID: "bg-red-500/15 text-red-600 dark:text-red-400",
  };
  return (
    <Badge variant="outline" className={`border-0 ${map[status]}`}>
      {status}
    </Badge>
  );
}

export function DiagnosticsDialog({
  processorId,
  onClose,
}: {
  processorId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useProcessorDiagnostics(processorId);

  return (
    <Dialog open={!!processorId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Diagnostics</DialogTitle>
        </DialogHeader>
        {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
        {error && (
          <p className="text-sm text-red-500">{(error as Error).message}</p>
        )}
        {data != null && (
          <pre className="max-h-[60vh] overflow-auto rounded bg-muted p-3 text-xs">
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProcessorsTab({ pgId }: { pgId: string }) {
  const [diagId, setDiagId] = useState<string | null>(null);
  const { data: procs, isLoading, isError, error } = useProcessors(pgId);
  const [editProc, setEditProc] = useState<Processor | null>(null);
  const startProc = useStartProcessor(pgId);
  const stopProc = useStopProcessor(pgId);
  const removeProc = useRemoveProcessor(pgId);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <AddProcessorDialog pgId={pgId} />
      </div>
      <DiagnosticsDialog processorId={diagId} onClose={() => setDiagId(null)} />
      <EditProcessorDialog
        processor={editProc}
        pgId={pgId}
        onClose={() => setEditProc(null)}
      />

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Tipe</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-center">Queued</TableHead>
              <TableHead className="text-center">Lainnya</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {isError && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-red-500">
                  <AlertCircle className="mx-auto mb-1 h-5 w-5" />
                  {(error as Error).message}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && procs?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  Belum ada processor.
                </TableCell>
              </TableRow>
            )}
            {procs?.map((p: Processor) => {
              const running = p.status === "RUNNING";
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.type}</TableCell>
                  <TableCell className="text-center">
                    <ProcStatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="text-center">{p.queuedCount}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditProc(p)}>
                        <Settings className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDiagId(p.id)}
                      >
                        <Info className="h-4 w-4" /> Diagnostics
                      </Button>
                      {running ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => stopProc.mutate(p.id)}
                          disabled={stopProc.isPending}
                        >
                          <Square className="h-3.5 w-3.5" /> Stop
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startProc.mutate(p.id)}
                          disabled={startProc.isPending}
                        >
                          <Play className="h-3.5 w-3.5" /> Start
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500"
                        onClick={() => removeProc.mutate(p.id)}
                        disabled={removeProc.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Hapus
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="rounded-lg border bg-background p-8 text-center text-muted-foreground">
      Tab {label} — segera menyusul.
    </div>
  );
}

export default function PipelineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: pgId } = use(params); // Next.js 15+: params adalah Promise
  const startAll = useStartAll(pgId);
  const stopAll = useStopAll(pgId);

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/pipelines">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Detail Pipeline</h1>
            <p className="text-sm text-muted-foreground">ID: {pgId}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => startAll.mutate()}
            disabled={startAll.isPending}
          >
            <Play className="h-4 w-4" /> Start all
          </Button>
          <Button
            variant="outline"
            onClick={() => stopAll.mutate()}
            disabled={stopAll.isPending}
          >
            <Square className="h-4 w-4" /> Stop all
          </Button>
        </div>
      </div>

      <Tabs defaultValue="processors">
        <TabsList>
          <TabsTrigger value="processors">Processors</TabsTrigger>
          <TabsTrigger value="connections">Connections</TabsTrigger>
          {/* <TabsTrigger value="parameters">Parameters</TabsTrigger> */}
          <TabsTrigger value="services">Controller Services</TabsTrigger>
        </TabsList>

        <TabsContent value="processors" className="mt-4">
          <ProcessorsTab pgId={pgId} />
        </TabsContent>
        <TabsContent value="connections" className="mt-4">
          <ConnectionsTab pgId={pgId} />
        </TabsContent>
        <TabsContent value="services" className="mt-4">
          <ServicesTab pgId={pgId} />
        </TabsContent>
      </Tabs>
    </>
  );
}