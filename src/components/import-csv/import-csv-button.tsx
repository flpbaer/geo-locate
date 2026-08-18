"use client"

import { useState } from "react"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ImportCSVDialog } from "./import-csv-dialog"

export function ImportCSVButton() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="absolute right-3 top-3 z-10 bg-white shadow-md md:right-4 md:top-4"
        onClick={() => setIsDialogOpen(true)}
        title="Importar CSV"
      >
        <Upload className="h-4 w-4 md:mr-2" />
        <span className="hidden md:inline">Importar CSV</span>
      </Button>

      <ImportCSVDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </>
  )
}
