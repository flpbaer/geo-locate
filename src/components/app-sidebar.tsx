"use client"
import { BarChart3, ChevronDown, Folder, FolderTree, Loader2, Map, Search, User } from "lucide-react"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { useMapPoints } from "@/components/map-points-provider"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useLocationResolver } from "@/hooks/use-location-resolver"
import {
  GROUPING_LABELS,
  LOCATION_GROUPINGS,
  groupClients,
  useGroupingMode,
  type GroupingMode,
} from "@/lib/client-grouping"
import { normalizeText } from "@/lib/br-states"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { SidebarResizeHandle } from "@/components/sidebar-resize-handle"
import Link from "next/link"

export function AppSidebar() {
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({})
  const [searchTerm, setSearchTerm] = useState("")
  const pathname = usePathname()
  const { points, selectPoint, selectedPoint } = useMapPoints()
  const { setOpenMobile } = useSidebar()
  const [groupingMode, setGroupingMode] = useGroupingMode()
  const { isResolving, resolve } = useLocationResolver({ auto: false })

  // Trocar de tela fecha a gaveta: no celular ela cobre a tela inteira, e continuar
  // aberta sobre a página nova esconde justamente o que se foi ver.
  useEffect(() => setOpenMobile(false), [pathname, setOpenMobile])

  const filteredClients = useMemo(() => {
    const term = normalizeText(searchTerm)
    if (!term) return points

    return points.filter((client) =>
      [client.name, client.city, client.category].some(
        (value) => value && normalizeText(value).includes(term),
      ),
    )
  }, [points, searchTerm])

  const folders = useMemo(() => groupClients(filteredClients, groupingMode), [filteredClients, groupingMode])

  const isFolderOpen = (key: string) => openFolders[key] ?? (groupingMode === "none" || folders.length <= 3)

  const toggleFolder = (key: string, open: boolean) => setOpenFolders((prev) => ({ ...prev, [key]: open }))

  const changeGrouping = (mode: GroupingMode) => {
    setGroupingMode(mode)
    setOpenFolders({})
    // Agrupar por estado/cidade exige o dado; buscar só quando o usuário pede.
    if (LOCATION_GROUPINGS.includes(mode)) void resolve()
  }

  return (
    <div>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem className="flex items-center gap-1">
              <SidebarMenuButton size="lg" asChild className="group-data-[collapsible=icon]:hidden">
                <Link href="/">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <User className="size-4" />
                  </div>
                  <div className="flex flex-col gap-0.5 leading-none">
                    <span className="font-semibold">GEO</span>
                    <span className="text-xs">v1.0.0</span>
                  </div>
                </Link>
              </SidebarMenuButton>
              <SidebarTrigger className="shrink-0" title="Minimizar barra lateral (⌘B)" />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navegação</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/"}>
                    <Link href="/">
                      <Map />
                      <span>Mapa</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/insights"}>
                    <Link href="/insights">
                      <BarChart3 />
                      <span>Insights</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>Pesquisar</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar clientes..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel className="flex items-center justify-between gap-2">
              <span>Clientes ({points.length})</span>
              <DropdownMenu>
                <DropdownMenuTrigger className="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-xs hover:bg-sidebar-accent">
                  <FolderTree className="h-3.5 w-3.5" />
                  {GROUPING_LABELS[groupingMode]}
                  <ChevronDown className="h-3 w-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(Object.keys(GROUPING_LABELS) as GroupingMode[]).map((mode) => (
                    <DropdownMenuItem
                      key={mode}
                      onClick={() => changeGrouping(mode)}
                      className={mode === groupingMode ? "bg-accent" : ""}
                    >
                      {GROUPING_LABELS[mode]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarGroupLabel>

            <SidebarGroupContent>
              {isResolving && (
                <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Identificando localizações...
                </div>
              )}

              <SidebarMenu>
                {points.length === 0 || folders.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-muted-foreground">
                    {searchTerm ? "Nenhum cliente encontrado" : "Nenhum cliente importado"}
                  </div>
                ) : (
                  folders.map((folder) => {
                    const open = isFolderOpen(folder.key)

                    return (
                      <Collapsible
                        key={folder.key}
                        open={open}
                        onOpenChange={(next) => toggleFolder(folder.key, next)}
                        className="w-full"
                      >
                        <SidebarMenuItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton>
                              <Folder className={folder.isFallback ? "text-muted-foreground" : "text-blue-500"} />
                              <span className="truncate">{folder.label}</span>
                              <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                                {folder.points.length}
                                <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
                              </span>
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                        </SidebarMenuItem>

                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {folder.points.map((client) => (
                              <SidebarMenuSubItem key={client.id}>
                                <SidebarMenuSubButton
                                  onClick={() => selectPoint(client)}
                                  className={`h-auto w-full cursor-pointer py-1.5 ${
                                    selectedPoint?.id === client.id
                                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                      : ""
                                  }`}
                                >
                                  <div className="flex flex-col items-start w-full min-w-0 gap-0.5">
                                    <span className="text-sm font-medium truncate w-full text-left">{client.name}</span>
                                    {(client.city || client.description) && (
                                      <span className="text-xs text-muted-foreground truncate w-full text-left">
                                        {[
                                          [client.city, client.state].filter(Boolean).join(" - "),
                                          client.description,
                                        ]
                                          .filter(Boolean)
                                          .join(" · ")}
                                      </span>
                                    )}
                                  </div>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </Collapsible>
                    )
                  })
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton>
                <Avatar className="h-6 w-6">
                  <AvatarImage src="/placeholder.svg?height=24&width=24" />
                  <AvatarFallback>U</AvatarFallback>
                </Avatar>
                <span>Administrador</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarResizeHandle />
    </div>
  )
}
