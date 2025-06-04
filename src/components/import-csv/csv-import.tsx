"use client"

import type React from "react"
import { useState, useRef } from "react"
import { Upload, X, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"

interface CSVPoint {
  id: string
  name: string
  lat: number
  lng: number
  description?: string
}

interface CSVImportProps {
  onPointsImported: (points: CSVPoint[]) => void
  importedPoints: CSVPoint[]
  onClearPoints: () => void
}

export function CSVImport({ onPointsImported, importedPoints, onClearPoints }: CSVImportProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processCSV = async (file: File) => {
    setIsProcessing(true)
    setError(null)

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
      const points: CSVPoint[] = []

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map((v) => v.trim())

        if (values.length < 3) continue
        const lat = Number.parseFloat(values[latIndex])
        const lng = Number.parseFloat(values[lngIndex])
        const name = values[nameIndex] || `Ponto ${i}`
        const description = descIndex >= 0 ? values[descIndex] : undefined

        if (isNaN(lat) || isNaN(lng)) {
          console.warn(`Linha ${i + 1}: Coordenadas inválidas`)
          continue
        }

        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          console.warn(`Linha ${i + 1}: Coordenadas fora do range válido`)
          continue
        }

        points.push({
          id: `csv-point-${i}`,
          name,
          lat,
          lng,
          description,
        })
      }

      if (points.length === 0) {
        throw new Error("Nenhum ponto válido foi encontrado no arquivo")
      }

      onPointsImported(points)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao processar arquivo")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setError("Por favor, selecione um arquivo CSV")
        return
      }
      processCSV(file)
    }
  }

  const handleClearPoints = () => {
    onClearPoints()
    setError(null)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Importar Pontos</CardTitle>
          <CardDescription className="text-xs">Adicione pontos no mapa através de arquivo CSV</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="csv-file" className="text-xs font-medium">
              Arquivo CSV
            </Label>
            <div className="flex items-center gap-2">
              <Input
                ref={fileInputRef}
                id="csv-file"
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                disabled={isProcessing}
                className="text-xs"
              />
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
                <Upload className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          {isProcessing && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Processando arquivo...
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium">Formato esperado:</p>
            <p>• Colunas: name, lat, lng</p>
            <p>• Separador: vírgula (,)</p>
            <p>• Primeira linha: cabeçalho</p>
          </div>
        </CardContent>
      </Card>

      {importedPoints.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Pontos Importados</CardTitle>
              <Badge variant="secondary" className="text-xs">
                {importedPoints.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-32 overflow-y-auto space-y-1">
              {importedPoints.slice(0, 5).map((point) => (
                <div key={point.id} className="flex items-center gap-2 text-xs">
                  <MapPin className="h-3 w-3 text-blue-500 flex-shrink-0" />
                  <span className="truncate">{point.name}</span>
                </div>
              ))}
              {importedPoints.length > 5 && (
                <p className="text-xs text-muted-foreground">+{importedPoints.length - 5} pontos adicionais</p>
              )}
            </div>

            <Separator />

            <Button size="sm" variant="outline" onClick={handleClearPoints} className="w-full text-xs">
              <X className="h-3 w-3 mr-1" />
              Limpar Pontos
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
