package service

import (
	"errors"
	"fmt"
	"net/http"

	"face-detection-backend/internal/store"
)

type AppError struct {
	Code   string `json:"code"`
	Msg    string `json:"message"`
	Status int    `json:"-"`
}

func (e AppError) Error() string { return e.Msg }

func BadRequest(format string, args ...any) AppError {
	return AppError{Code: "VALIDATION_ERROR", Msg: fmt.Sprintf(format, args...), Status: http.StatusBadRequest}
}

func NotFound(resource string) AppError {
	return AppError{Code: "NOT_FOUND", Msg: resource + " not found", Status: http.StatusNotFound}
}

func Conflict(format string, args ...any) AppError {
	return AppError{Code: "CONFLICT", Msg: fmt.Sprintf(format, args...), Status: http.StatusConflict}
}

func FromStore(err error, duplicateMessage string) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, store.ErrNotFound) {
		return NotFound("resource")
	}
	if errors.Is(err, store.ErrDuplicate) {
		return Conflict("%s", duplicateMessage)
	}
	return err
}
