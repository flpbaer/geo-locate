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
        className="absolute right-4 top-4 z-10 bg-white shadow-md"
        onClick={() => setIsDialogOpen(true)}
      >
        <Upload className="mr-2 h-4 w-4" />
        Importar CSV
      </Button>

      <ImportCSVDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </>
  )
}
