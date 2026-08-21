"use client";

import { useState } from "react";
import { Trash2, Eraser, Loader2, Save } from "lucide-react";

import {
  useConnections,
  useEmptyQueue,
  useRemoveConnection,
  useParameters,
  useUpdateParameters,
  useControllerServices,
  useToggleService,
  useRemoveService,
} from "@/lib/nifi/hooks";

import { AddConnectionDialog } from "@/components/add-connection-dialog";
import { EditConnectionDialog } from "@/components/edit-connection-dialog";
import { Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Connection } from "@/lib/nifi/types";

function Empty({ text }: { text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={99} className="h-24 text-center text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  );
}

/* ============ CONNECTIONS ============ */
export function ConnectionsTab({ pgId }: { pgId: string }) {
  const { data, isLoading } = useConnections(pgId);
  const emptyQ = useEmptyQueue(pgId);
  const removeC = useRemoveConnection(pgId);
  const [editConn, setEditConn] = useState<Connection | null>(null); // ← tambah

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <AddConnectionDialog pgId={pgId} />
      </div>
      <EditConnectionDialog
        connection={editConn}
        pgId={pgId}
        onClose={() => setEditConn(null)}
      />
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sumber dan Tujuan</TableHead>
              <TableHead>Relationship</TableHead>
              <TableHead className="text-center">Antrian</TableHead>
              <TableHead className="w-[180px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <Empty text="Memuat..." />}
            {!isLoading && data?.length === 0 && (
              <Empty text="Belum ada koneksi." />
            )}
            {data?.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  {c.sourceName} ke {c.destinationName}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {c.relationships.map((r) => (
                      <Badge key={r} variant="secondary">
                        {r}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  {c.queuedCount}{" "}
                  <span className="text-muted-foreground">({c.queuedSize})</span>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => emptyQ.mutate(c.id)}
                      disabled={emptyQ.isPending}
                    >
                      <Eraser className="h-3.5 w-3.5" /> Kosongkan
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setEditConn(c)}>
                      <Settings className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500"
                      onClick={() => removeC.mutate(c.id)}
                      disabled={removeC.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ============ PARAMETERS ============ */
export function ParametersTab({ pgId }: { pgId: string }) {
  const { data, isLoading } = useParameters(pgId);
  const updateP = useUpdateParameters(pgId);
  const [edited, setEdited] = useState<Record<string, string>>({});

  const contextId = data?.contextId ?? null;

  function save(name: string) {
    if (!contextId) return;
    // NOTE: sesuaikan bentuk body dengan yang diharapkan backend PATCH-mu
    updateP.mutate({
      contextId,
      body: {
        parameters: [{ parameter: { name, value: edited[name] } }],
      },
    });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Nilai</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <Empty text="Memuat..." />}
            {!isLoading && (data?.params.length ?? 0) === 0 && (
              <Empty text="Tidak ada parameter." />
            )}
            {data?.params.map((p) => (
              <TableRow key={p.name}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>
                  <Input
                    defaultValue={p.sensitive ? "" : p.value}
                    placeholder={p.sensitive ? "(sensitive)" : ""}
                    type={p.sensitive ? "password" : "text"}
                    onChange={(e) =>
                      setEdited((s) => ({ ...s, [p.name]: e.target.value }))
                    }
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={edited[p.name] === undefined || updateP.isPending}
                    onClick={() => save(p.name)}
                  >
                    <Save className="h-3.5 w-3.5" /> Simpan
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ============ CONTROLLER SERVICES ============ */
export function ServicesTab({ pgId }: { pgId: string }) {
  const { data, isLoading } = useControllerServices(pgId);
  const toggle = useToggleService(pgId);
  const remove = useRemoveService(pgId);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Tipe</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[220px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <Empty text="Memuat..." />}
            {!isLoading && data?.length === 0 && (
              <Empty text="Belum ada controller service (atau endpoint list belum ada)." />
            )}
            {data?.map((s) => {
              const enabled = s.state === "ENABLED";
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.type}
                  </TableCell>
                  <TableCell>
                    <Badge variant={enabled ? "default" : "secondary"}>
                      {s.state}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          toggle.mutate({ csId: s.id, enabled: !enabled })
                        }
                        disabled={toggle.isPending}
                      >
                        {enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500"
                        onClick={() => remove.mutate(s.id)}
                        disabled={remove.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
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