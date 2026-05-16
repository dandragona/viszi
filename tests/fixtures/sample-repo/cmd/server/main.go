package main

import (
	"net/http"
)

type Handler struct{}

func (h *Handler) Serve() {
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {})
}

func main() {
	h := &Handler{}
	h.Serve()
}
