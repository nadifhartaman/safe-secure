"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Plus,
  Play,
  Square,
  Trash2,
  MoreHorizontal,
  Loader2,
  AlertCircle,
} from "lucide-react";

import {
  usePipelines,
  useStartPipeline,
  useStopPipeline,
  useDeletePipeline,
} from "@/lib/nifi/hooks";
import type { Pipeline, PipelineStatus } from "@/lib/nifi/types";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CreatePipelineDialog } from "@/components/create-pipeline-dialog";

function StatusBadge({ status }: { status: PipelineStatus }) {
  const map: Record<PipelineStatus, string> = {
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

export default function PipelinesPage() {
  const { data: pipelines, isLoading, isError, error } = usePipelines();
  const startMut = useStartPipeline();
  const stopMut = useStopPipeline();
  const deleteMut = useDeletePipeline();

  const [toDelete, setToDelete] = useState<Pipeline | null>(null);

  return (
    <>
      {/* Header halaman */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipelines</h1>
          <p className="text-muted-foreground">
            Kelola process group NiFi kamu di sini.
          </p>
        </div>
        <CreatePipelineDialog />
      </div>

      {/* Tabel */}
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Processor</TableHead>
              <TableHead className="text-center">Antrian</TableHead>
              <TableHead>Throughput</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}

            {isError && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-red-500">
                  <AlertCircle className="mx-auto mb-1 h-5 w-5" />
                  Gagal memuat: {(error as Error).message}
                </TableCell>
              </TableRow>
            )}

            {!isLoading && !isError && pipelines?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  Belum ada pipeline.
                </TableCell>
              </TableRow>
            )}

            {pipelines?.map((p) => {
              const isRunning = p.status === "RUNNING";
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Link href={`/pipelines/${p.id}`} className="hover:underline">
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="text-center">{p.processorCount}</TableCell>
                  <TableCell className="text-center">{p.queuedCount}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.throughput ?? "—"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {isRunning ? (
                          <DropdownMenuItem
                            onClick={() => stopMut.mutate(p.id)}
                            disabled={stopMut.isPending}
                          >
                            <Square className="h-4 w-4" />
                            Stop
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => startMut.mutate(p.id)}
                            disabled={startMut.isPending}
                          >
                            <Play className="h-4 w-4" />
                            Start
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem asChild>
                          <Link href={`/pipelines/${p.id}`}>Buka Detail</Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-500 focus:text-red-500"
                          onClick={() => setToDelete(p)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Hapus
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Konfirmasi hapus */}
      <AlertDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus pipeline?</AlertDialogTitle>
            <AlertDialogDescription>
              Pipeline <b>{toDelete?.name}</b> akan dihapus permanen. Tindakan ini
              tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (toDelete) deleteMut.mutate(toDelete.id);
                setToDelete(null);
              }}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}