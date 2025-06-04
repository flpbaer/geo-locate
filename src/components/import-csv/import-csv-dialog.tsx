/* eslint-disable @typescript-eslint/no-unused-vars */
"use client"

import type React from "react"

import { useState, useRef, useMemo } from "react"
import { Upload, MapPin, FileSpreadsheet, AlertCircle, Plus, RotateCcw } from "lucide-react"
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
}

type ImportMode = "concatenate" | "overwrite" | null
type ImportStep = "upload" | "preview" | "confirm"

export function ImportCSVDialog({ open, onOpenChange }: ImportCSVDialogProps) {
  const { createMultiplePoints, deleteAllPoints, points, isLoading, error, clearError } = useMapPoints()
  const [previewPoints, setPreviewPoints] = useState<PreviewPoint[]>([])
  const [processingFile, setProcessingFile] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [importStep, setImportStep] = useState<ImportStep>("upload")
  const [importMode, setImportMode] = useState<ImportMode>(null)
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
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase())
      const requiredColumns = ["lat", "lng", "name"]
      const missingColumns = requiredColumns.filter(
        (col) =>
          !headers.some(
            (h) => h.includes(col) || h.includes(col.replace("lat", "latitude").replace("lng", "longitude")),
          ),
      )

      if (missingColumns.length > 0) {
        throw new Error(
          `Colunas obrigatórias não encontradas: ${missingColumns.join(", ")}. O CSV deve conter: name, lat/latitude, lng/longitude`,
        )
      }

      const nameIndex = headers.findIndex((h) => h.includes("name") || h.includes("nome"))
      const latIndex = headers.findIndex((h) => h.includes("lat"))
      const lngIndex = headers.findIndex((h) => h.includes("lng") || h.includes("lon"))
      const descIndex = headers.findIndex((h) => h.includes("desc") || h.includes("description"))
      const categoryIndex = headers.findIndex((h) => h.includes("category") || h.includes("categoria"))
      const colorIndex = headers.findIndex((h) => h.includes("color") || h.includes("cor"))

      const newPoints: PreviewPoint[] = []

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map((v) => v.trim())

        if (values.length < 3) continue

        const lat = Number.parseFloat(values[latIndex])
        const lng = Number.parseFloat(values[lngIndex])
        const name = values[nameIndex] || `Ponto ${i}`

        if (isNaN(lat) || isNaN(lng)) {
          console.warn(`Linha ${i + 1}: Coordenadas inválidas`)
          continue
        }

        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          console.warn(`Linha ${i + 1}: Coordenadas fora do range válido`)
          continue
        }

        newPoints.push({
          id: `preview-${i}`,
          name,
          lat,
          lng,
          description: descIndex >= 0 ? values[descIndex] : undefined,
          category: categoryIndex >= 0 ? values[categoryIndex] : undefined,
          color: colorIndex >= 0 ? values[colorIndex] : undefined,
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
      }))

      if (mode === "overwrite") {
        await deleteAllPoints()
      }
      await createMultiplePoints(pointsToCreate)
      resetDialog()
      onOpenChange(false)
    } catch (error) {
      console.error("Erro ao importar pontos:", error)
    }
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
          </DialogTitle>
          <DialogDescription>
            {importStep === "upload" && "Carregue um arquivo CSV com pontos para adicionar ao mapa."}
            {importStep === "preview" && `${previewPoints.length} pontos encontrados no arquivo.`}
            {importStep === "confirm" && "Escolha como deseja importar os pontos."}
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
                        <span className="text-xs text-muted-foreground ml-auto">
                          {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
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
        </div>

        <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2">
          <div className="text-xs text-muted-foreground mb-4 sm:mb-0">
            {importStep === "upload" && <p>Formato esperado: name, lat, lng, description, category, color</p>}
            {importStep === "preview" && <p>{previewPoints.length} pontos encontrados no arquivo</p>}
            {importStep === "confirm" && (
              <p>
                {duplicateAnalysis.duplicates > 0
                  ? `${duplicateAnalysis.duplicates} duplicatas detectadas`
                  : "Nenhuma duplicata detectada"}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCancel} className="cursor-pointer">
              Cancelar
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
