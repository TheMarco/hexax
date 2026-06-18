; Hexax SNES ROM header / memory map / interrupt vectors (LoROM, SlowROM).
; Standard PVSnesLib boilerplate; symbols VBlank / EmptyHandler / tcc__start
; are provided by the PVSnesLib crt0/runtime.

.MEMORYMAP
  SLOTSIZE $8000
  DEFAULTSLOT 0
  SLOT 0 $8000
  SLOT 1 $0 $2000
  SLOT 2 $2000 $E000
  SLOT 3 $0 $10000
.ENDME

.ROMBANKSIZE $8000          ; 32 KB per bank
.ROMBANKS 8                 ; 256 KB ROM (2 Mbit) to start

.SNESHEADER
  ID "SNES"

  NAME "HEXAX                "  ; 21 bytes, pad with spaces
  ;    "123456789012345678901"

  SLOWROM
  LOROM

  CARTRIDGETYPE $00         ; ROM only
  ROMSIZE $08               ; 2 Mbit
  SRAMSIZE $00              ; no SRAM
  COUNTRY $01               ; U.S.
  LICENSEECODE $00
  VERSION $00
.ENDSNES

.SNESNATIVEVECTOR
  COP EmptyHandler
  BRK EmptyHandler
  ABORT EmptyHandler
  NMI VBlank
  IRQ EmptyHandler
.ENDNATIVEVECTOR

.SNESEMUVECTOR
  COP EmptyHandler
  ABORT EmptyHandler
  NMI EmptyHandler
  RESET tcc__start
  IRQBRK EmptyHandler
.ENDEMUVECTOR
