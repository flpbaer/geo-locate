/* eslint-disable @typescript-eslint/no-unused-vars */
"use client"

import type React from "react"

import { useState, useRef, useMemo } from "react"
import { Upload, MapPin, FileSpreadsheet, AlertCircle, Plus, RotateCcw, FolderTree, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useMapPoints } from "@/components/map-points-provider"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { toStateCode } from "@/lib/br-states"
import { findCSVColumns, parseCSVLine, valueAt } from "@/lib/csv"
import {
  GROUPING_LABELS,
  LOCATION_GROUPINGS,
  groupClients,
  useGroupingMode,
  type GroupingMode,
} from "@/lib/client-grouping"
import { useLocationResolver } from "@/hooks/use-location-resolver"
import type { CreatePointData, Point } from "@/types/point"

interface ImportCSVDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface PreviewPoint {
  id: string
  name: string
  lat: number
  lng: number
  description?: string
  category?: string
  color?: string
  city?: string
  state?: string
}

type ImportMode = "concatenate" | "overwrite" | null
type ImportStep = "upload" | "preview" | "confirm" | "organize"

export function ImportCSVDialog({ open, onOpenChange }: ImportCSVDialogProps) {
  const { createMultiplePoints, deleteAllPoints, points, isLoading, error, clearError } = useMapPoints()
  const [previewPoints, setPreviewPoints] = useState<PreviewPoint[]>([])
  const [processingFile, setProcessingFile] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [importStep, setImportStep] = useState<ImportStep>("upload")
  const [importMode, setImportMode] = useState<ImportMode>(null)
  const [, setGrouping] = useGroupingMode()
  const { resolve: resolveLocations } = useLocationResolver({ auto: false })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const hasExistingPoints = points.length > 0
  const duplicateAnalysis = useMemo(() => {
    if (!previewPoints.length || !points.length) {
      return { duplicates: 0, newPoints: previewPoints.length }
    }

    const existingCoords = new Map<string, Point>()
    points.forEach((point) => {
      const key = `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`
      existingCoords.set(key, point)
    })

    let duplicateCount = 0
    previewPoints.forEach((point) => {
      const key = `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`
      if (existingCoords.has(key)) {
        duplicateCount++
      }
    })

    return {
      duplicates: duplicateCount,
      newPoints: previewPoints.length - duplicateCount,
    }
  }, [previewPoints, points])

  /** Quantas pastas cada critério geraria na base já importada. */
  const groupingOptions = useMemo(() => {
    const missingLocation = points.filter((point) => !point.state).length
    const missingCity = points.filter((point) => !point.city).length
    const missingCategory = points.filter((point) => !point.category).length

    const pendingHint = (missing: number) =>
      missing > 0 ? ` ${missing} cliente(s) ainda sem o dado serão identificados automaticamente.` : ""

    return [
      {
        mode: "none" as GroupingMode,
        folders: null,
        hint: "Mantém uma lista única com todos os clientes.",
      },
      {
        mode: "state" as GroupingMode,
        folders: groupClients(points, "state").length,
        hint: `Uma pasta por estado, da maior para a menor.${pendingHint(missingLocation)}`,
      },
      {
        mode: "city" as GroupingMode,
        folders: groupClients(points, "city").length,
        hint: `Uma pasta por cidade.${pendingHint(missingCity)}`,
      },
      {
        mode: "category" as GroupingMode,
        folders: groupClients(points, "category").length,
        hint:
          missingCategory === points.length
            ? "Nenhum cliente tem categoria no CSV importado."
            : `Usa a coluna "categoria" do CSV.${
                missingCategory > 0 ? ` ${missingCategory} sem categoria ficam em uma pasta à parte.` : ""
              }`,
      },
    ]
  }, [points])

  const processCSVPreview = async (file: File) => {
    setProcessingFile(true)
    setParseError(null)
    clearError()

    try {
      const text = await file.text()
      const lines = text.split("\n").filter((line) => line.trim())

      if (lines.length < 2) {
        throw new Error("O arquivo CSV deve ter pelo menos um cabeçalho e uma linha de dados")
      }
      const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase())
      const columns = findCSVColumns(headers)

      const missingColumns = (["name", "lat", "lng"] as const).filter((column) => columns[column] === -1)

      if (missingColumns.length > 0) {
        throw new Error(
          `Colunas obrigatórias não encontradas: ${missingColumns.join(", ")}. O CSV deve conter: name, lat/latitude, lng/longitude`,
        )
      }

      const newPoints: PreviewPoint[] = []

      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i])

        if (values.length < 3) continue

        const lat = Number.parseFloat(values[columns.lat])
        const lng = Number.parseFloat(values[columns.lng])
        const name = values[columns.name] || `Ponto ${i}`

        if (isNaN(lat) || isNaN(lng)) {
          console.warn(`Linha ${i + 1}: Coordenadas inválidas`)
          continue
        }

        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          console.warn(`Linha ${i + 1}: Coordenadas fora do range válido`)
          continue
        }

        const state = valueAt(values, columns.state)

        newPoints.push({
          id: `preview-${i}`,
          name,
          lat,
          lng,
          description: valueAt(values, columns.description),
          category: valueAt(values, columns.category),
          color: valueAt(values, columns.color),
          city: valueAt(values, columns.city),
          state: toStateCode(state) ?? state,
        })
      }

      if (newPoints.length === 0) {
        throw new Error("Nenhum ponto válido foi encontrado no arquivo")
      }

      setPreviewPoints(newPoints)
      setImportStep("preview")

      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Erro ao processar arquivo")
      setPreviewPoints([])
    } finally {
      setProcessingFile(false)
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setParseError("Por favor, selecione um arquivo CSV")
        return
      }
      processCSVPreview(file)
    }
  }

  const handleImport = async () => {
    if (previewPoints.length === 0) return
    if (hasExistingPoints) {
      setImportStep("confirm")
      return
    }
    await executeImport("concatenate")
  }

  const executeImport = async (mode: ImportMode) => {
    if (!mode || previewPoints.length === 0) return

    try {
      const pointsToCreate: CreatePointData[] = previewPoints.map((point) => ({
        name: point.name,
        lat: point.lat,
        lng: point.lng,
        description: point.description,
        category: point.category,
        color: point.color,
        city: point.city,
        state: point.state,
      }))

      if (mode === "overwrite") {
        await deleteAllPoints()
      }
      await createMultiplePoints(pointsToCreate)
      // Importou: agora pergunta como organizar a lista de clientes.
      setImportMode(mode)
      setImportStep("organize")
    } catch (error) {
      console.error("Erro ao importar pontos:", error)
    }
  }

  const applyGrouping = (mode: GroupingMode) => {
    setGrouping(mode)

    // Agrupar por estado/cidade exige o dado — este clique é o aceite para buscá-lo.
    if (LOCATION_GROUPINGS.includes(mode)) {
      void resolveLocations()
    }

    resetDialog()
    onOpenChange(false)
  }

  const resetDialog = () => {
    setPreviewPoints([])
    setParseError(null)
    setImportStep("upload")
    setImportMode(null)
    clearError()
  }

  const handleCancel = () => {
    resetDialog()
    onOpenChange(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setParseError("Por favor, selecione um arquivo CSV")
        return
      }
      processCSVPreview(file)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleCancel()
        else onOpenChange(true)
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {importStep === "upload" && "Importar Pontos CSV"}
            {importStep === "preview" && "Visualizar Pontos"}
            {importStep === "confirm" && "Confirmar Importação"}
            {importStep === "organize" && "Organizar Clientes"}
          </DialogTitle>
          <DialogDescription>
            {importStep === "upload" && "Carregue um arquivo CSV com pontos para adicionar ao mapa."}
            {importStep === "preview" && `${previewPoints.length} pontos encontrados no arquivo.`}
            {importStep === "confirm" && "Escolha como deseja importar os pontos."}
            {importStep === "organize" && "Importação concluída. Escolha como agrupar a lista de clientes."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden py-4" onDragOver={handleDragOver} onDrop={handleDrop}>
          {importStep === "upload" && (
            <>
              <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-gray-300 p-6">
                <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium">Arraste e solte seu arquivo CSV aqui</p>
                  <p className="text-xs text-muted-foreground">ou</p>
                </div>
                <Input
                  ref={fileInputRef}
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  disabled={processingFile}
                  className="max-w-xs cursor-pointer"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={processingFile}
                  className="cursor-pointer"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Selecionar arquivo
                </Button>
              </div>

              {/* Primeira vez aqui: leva o modelo pronto em vez de adivinhar o formato. */}
              <div className="mt-4 rounded-lg border bg-muted/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Não sabe como montar o arquivo?</p>
                    <p className="text-xs text-muted-foreground">
                      Baixe o modelo com 31 empresas de exemplo, em 12 estados.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" asChild className="cursor-pointer">
                    <a href="/clientes-exemplo.csv" download="clientes-exemplo.csv">
                      <Download className="mr-2 h-4 w-4" />
                      Baixar exemplo
                    </a>
                  </Button>
                </div>

                <Separator className="my-3" />

                <p className="text-xs font-medium text-foreground">Colunas aceitas</p>
                <div className="mt-2 space-y-1.5 text-xs">
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      obrigatórias
                    </Badge>
                    <span className="font-mono text-muted-foreground">name, lat, lng</span>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      opcionais
                    </Badge>
                    <span className="font-mono text-muted-foreground">
                      description, categoria, cidade, estado, endereco, bairro, cep, color
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Sem cidade e estado, o app identifica pelas coordenadas.
                </p>
              </div>

              {parseError && (
                <Alert variant="destructive" className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{parseError}</AlertDescription>
                </Alert>
              )}

              {error && (
                <Alert variant="destructive" className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {processingFile && (
                <div className="flex items-center justify-center gap-2 py-4 mt-4">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  <p className="text-sm">Processando arquivo...</p>
                </div>
              )}
            </>
          )}

          {importStep === "preview" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Pontos para Importar</h3>
                <Badge variant="secondary">{previewPoints.length} pontos</Badge>
              </div>

              {hasExistingPoints && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Você já possui {points.length} ponto(s) importado(s).
                    {duplicateAnalysis.duplicates > 0 && (
                      <span className="font-medium text-amber-600">
                        {" "}
                        Detectamos {duplicateAnalysis.duplicates} ponto(s) possivelmente duplicado(s).
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <div className="rounded-md border">
                <ScrollArea className="h-[300px] w-full">
                  <div className="p-2">
                    {previewPoints.map((point) => (
                      <div key={point.id} className="flex items-center gap-2 py-1 text-sm">
                        <MapPin className="h-3 w-3 text-blue-500 flex-shrink-0" />
                        <span className="font-medium truncate">{point.name}</span>
                        <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                          {point.city
                            ? `${point.city}${point.state ? ` - ${point.state}` : ""}`
                            : `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}

          {importStep === "confirm" && (
            <div className="space-y-6">
              <Alert className="bg-amber-50 border-amber-200">
                <AlertDescription className="text-amber-800">
                  <p className="font-medium">Você já possui {points.length} ponto(s) no mapa.</p>
                  <p className="mt-1">Como deseja proceder com os {previewPoints.length} novos pontos?</p>
                  {duplicateAnalysis.duplicates > 0 && (
                    <p className="mt-2 font-medium">
                      ⚠️ Detectamos {duplicateAnalysis.duplicates} ponto(s) com coordenadas idênticas a pontos já
                      existentes.
                    </p>
                  )}
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-1 gap-4">
                <Button
                  variant="outline"
                  onClick={() => executeImport("concatenate")}
                  disabled={isLoading}
                  className="cursor-pointer p-6 h-auto flex flex-col items-center gap-2  hover:border-blue-300 hover:bg-blue-50"
                >
                  <div className="flex items-center gap-2">
                    <Plus className="h-5 w-5 text-blue-500" />
                    <span className="text-lg font-medium">Adicionar aos existentes</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Mantém os {points.length} pontos atuais e adiciona {duplicateAnalysis.newPoints} novos pontos
                  </p>
                  <Badge variant="secondary" className="mt-1">
                    {points.length + duplicateAnalysis.newPoints} total após importação
                  </Badge>
                </Button>

                <Button
                  variant="outline"
                  onClick={() => executeImport("overwrite")}
                  disabled={isLoading}
                  className="cursor-pointer p-6 h-auto flex flex-col items-center gap-2  hover:border-blue-300 hover:bg-blue-50"
                >
                  <div className="flex items-center gap-2">
                    <RotateCcw className="h-5 w-5" />
                    <span className="text-lg font-medium">Substituir todos</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Remover os pontos atuais e importar os {previewPoints.length} novos pontos
                  </p>
                  <Badge variant="secondary" className="mt-1">
                    {previewPoints.length} total após importação
                  </Badge>
                </Button>
              </div>
            </div>
          )}

          {importStep === "organize" && (
            <div className="space-y-4">
              <Alert>
                <FolderTree className="h-4 w-4" />
                <AlertDescription>
                  {points.length} cliente(s) na base. Quer separar a lista lateral em pastas?
                </AlertDescription>
              </Alert>

              <ScrollArea className="max-h-[320px]">
                <div className="grid grid-cols-1 gap-2 pr-2">
                  {groupingOptions.map((option) => (
                    <Button
                      key={option.mode}
                      variant="outline"
                      onClick={() => applyGrouping(option.mode)}
                      className="h-auto cursor-pointer flex-col items-start gap-1 p-4 text-left hover:border-blue-300 hover:bg-blue-50"
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="font-medium">{GROUPING_LABELS[option.mode]}</span>
                        {option.folders !== null && (
                          <Badge variant="secondary">
                            {option.folders} {option.folders === 1 ? "pasta" : "pastas"}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs font-normal text-muted-foreground whitespace-normal">{option.hint}</p>
                    </Button>
                  ))}
                </div>
              </ScrollArea>

              <p className="text-xs text-muted-foreground">
                Dá para mudar isso depois pelo menu &quot;Agrupar por&quot; na lista de clientes.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2">
          <div className="text-xs text-muted-foreground mb-4 sm:mb-0">
            {importStep === "preview" && <p>{previewPoints.length} pontos encontrados no arquivo</p>}
            {importStep === "organize" && <p>{points.length} clientes importados</p>}
            {importStep === "confirm" && (
              <p>
                {duplicateAnalysis.duplicates > 0
                  ? `${duplicateAnalysis.duplicates} duplicatas detectadas`
                  : "Nenhuma duplicata detectada"}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => (importStep === "organize" ? applyGrouping("none") : handleCancel())}
              className="cursor-pointer"
            >
              {importStep === "organize" ? "Agora não" : "Cancelar"}
            </Button>
            {importStep === "preview" && (
              <Button
                onClick={handleImport}
                disabled={previewPoints.length === 0 || isLoading}
                className="cursor-pointer"
              >
                {hasExistingPoints ? "Continuar" : "Confirmar"}{" "}
                {previewPoints.length > 0 ? `(${previewPoints.length})` : ""}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
