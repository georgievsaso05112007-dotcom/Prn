"""
LSTM-based trading model implemented in PyTorch.

Architecture: stacked bidirectional-optional LSTM with dropout,
followed by a linear classification head.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Dict, Tuple

import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import f1_score, precision_score, recall_score, accuracy_score
from torch.utils.data import DataLoader, TensorDataset

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
#  Model definition                                                            #
# --------------------------------------------------------------------------- #


class LSTMTradingModel(nn.Module):
    """
    Stacked LSTM classifier for 3-class directional prediction.

    Parameters
    ----------
    input_size:
        Number of input features per time step.
    hidden_size:
        Number of hidden units in each LSTM layer.
    num_layers:
        Number of stacked LSTM layers.
    output_size:
        Number of output classes (default 3: DOWN / NEUTRAL / UP).
    dropout:
        Dropout probability applied between LSTM layers and before the
        linear head.
    """

    def __init__(
        self,
        input_size: int,
        hidden_size: int = 128,
        num_layers: int = 2,
        output_size: int = 3,
        dropout: float = 0.2,
    ) -> None:
        super().__init__()
        self.input_size = input_size
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        self.output_size = output_size

        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )

        self.dropout = nn.Dropout(p=dropout)
        self.layer_norm = nn.LayerNorm(hidden_size)
        self.fc = nn.Linear(hidden_size, output_size)
        self.softmax = nn.Softmax(dim=-1)

        self._init_weights()

    # ------------------------------------------------------------------ #

    def _init_weights(self) -> None:
        for name, param in self.lstm.named_parameters():
            if "weight_ih" in name:
                nn.init.xavier_uniform_(param.data)
            elif "weight_hh" in name:
                nn.init.orthogonal_(param.data)
            elif "bias" in name:
                param.data.fill_(0)
                # Set forget gate bias to 1 (helps gradient flow)
                n = param.size(0)
                start, end = n // 4, n // 2
                param.data[start:end].fill_(1.0)
        nn.init.xavier_uniform_(self.fc.weight)
        nn.init.zeros_(self.fc.bias)

    # ------------------------------------------------------------------ #

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Parameters
        ----------
        x : Tensor of shape (batch, seq_len, input_size)

        Returns
        -------
        Tensor of shape (batch, output_size) — softmax probabilities.
        """
        out, _ = self.lstm(x)                   # (batch, seq_len, hidden)
        out = self.layer_norm(out[:, -1, :])     # take last time-step
        out = self.dropout(out)
        logits = self.fc(out)
        return self.softmax(logits)

    def predict_classes(self, x: torch.Tensor) -> torch.Tensor:
        """Return predicted class indices (argmax of softmax)."""
        with torch.no_grad():
            probs = self(x)
        return probs.argmax(dim=-1)


# --------------------------------------------------------------------------- #
#  Trainer                                                                     #
# --------------------------------------------------------------------------- #


class LSTMTrainer:
    """
    Handles training, evaluation, and checkpoint management for
    :class:`LSTMTradingModel`.
    """

    def __init__(
        self,
        model: LSTMTradingModel,
        learning_rate: float = 0.001,
        weight_decay: float = 1e-4,
    ) -> None:
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = model.to(self.device)
        self.optimizer = torch.optim.Adam(
            model.parameters(),
            lr=learning_rate,
            weight_decay=weight_decay,
        )
        self.scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
            self.optimizer, mode="min", factor=0.5, patience=3, verbose=False
        )
        self.criterion = nn.CrossEntropyLoss()
        logger.info("LSTMTrainer initialised on device: %s", self.device)

    # ------------------------------------------------------------------ #

    def train_epoch(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        batch_size: int = 32,
    ) -> float:
        """
        Run one full training epoch.

        Parameters
        ----------
        X_train:
            Numpy array of shape (n, seq_len, features).
        y_train:
            Numpy array of shape (n,) with integer class labels.
        batch_size:
            Mini-batch size.

        Returns
        -------
        float
            Mean cross-entropy loss over the epoch.
        """
        self.model.train()
        dataset = TensorDataset(
            torch.tensor(X_train, dtype=torch.float32),
            torch.tensor(y_train, dtype=torch.long),
        )
        loader = DataLoader(dataset, batch_size=batch_size, shuffle=True, drop_last=False)

        total_loss = 0.0
        for X_batch, y_batch in loader:
            X_batch = X_batch.to(self.device)
            y_batch = y_batch.to(self.device)

            self.optimizer.zero_grad()
            probs = self.model(X_batch)
            loss = self.criterion(probs, y_batch)
            loss.backward()
            nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
            self.optimizer.step()
            total_loss += loss.item() * len(X_batch)

        return total_loss / len(dataset)

    # ------------------------------------------------------------------ #

    def evaluate(
        self,
        X_val: np.ndarray,
        y_val: np.ndarray,
        batch_size: int = 128,
    ) -> Dict[str, float]:
        """
        Evaluate the model on a validation set.

        Returns
        -------
        dict
            Keys: accuracy, precision_macro, recall_macro, f1_macro,
                  f1_down, f1_neutral, f1_up.
        """
        self.model.eval()
        dataset = TensorDataset(
            torch.tensor(X_val, dtype=torch.float32),
            torch.tensor(y_val, dtype=torch.long),
        )
        loader = DataLoader(dataset, batch_size=batch_size, shuffle=False)

        all_preds: list[int] = []
        all_labels: list[int] = []

        with torch.no_grad():
            for X_batch, y_batch in loader:
                X_batch = X_batch.to(self.device)
                preds = self.model.predict_classes(X_batch).cpu().numpy()
                all_preds.extend(preds.tolist())
                all_labels.extend(y_batch.numpy().tolist())

        preds_arr = np.array(all_preds)
        labels_arr = np.array(all_labels)

        f1_per_class = f1_score(labels_arr, preds_arr, average=None, labels=[0, 1, 2], zero_division=0)

        metrics = {
            "accuracy": float(accuracy_score(labels_arr, preds_arr)),
            "precision_macro": float(
                precision_score(labels_arr, preds_arr, average="macro", zero_division=0)
            ),
            "recall_macro": float(
                recall_score(labels_arr, preds_arr, average="macro", zero_division=0)
            ),
            "f1_macro": float(
                f1_score(labels_arr, preds_arr, average="macro", zero_division=0)
            ),
            "f1_down": float(f1_per_class[0]) if len(f1_per_class) > 0 else 0.0,
            "f1_neutral": float(f1_per_class[1]) if len(f1_per_class) > 1 else 0.0,
            "f1_up": float(f1_per_class[2]) if len(f1_per_class) > 2 else 0.0,
        }

        # Step the LR scheduler based on validation macro-f1
        self.scheduler.step(1.0 - metrics["f1_macro"])

        return metrics

    # ------------------------------------------------------------------ #

    def save_checkpoint(
        self,
        path: str,
        epoch: int,
        val_metrics: Dict[str, float],
    ) -> None:
        """
        Persist model weights, optimiser state, and metadata.

        Parameters
        ----------
        path:
            Filesystem path for the checkpoint file (.pt).
        epoch:
            Current training epoch (stored in metadata).
        val_metrics:
            Validation metrics dict returned by :meth:`evaluate`.
        """
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        checkpoint = {
            "epoch": epoch,
            "model_state_dict": self.model.state_dict(),
            "optimizer_state_dict": self.optimizer.state_dict(),
            "val_metrics": val_metrics,
            "model_config": {
                "input_size": self.model.input_size,
                "hidden_size": self.model.hidden_size,
                "num_layers": self.model.num_layers,
                "output_size": self.model.output_size,
            },
        }
        torch.save(checkpoint, path)
        logger.info("Checkpoint saved → %s  (epoch=%d)", path, epoch)

    def load_checkpoint(self, path: str) -> Dict:
        """
        Load a checkpoint from *path*.

        Restores model and optimiser state in-place.

        Returns
        -------
        dict
            Full checkpoint dict (includes epoch, val_metrics, model_config).
        """
        checkpoint = torch.load(path, map_location=self.device, weights_only=False)
        self.model.load_state_dict(checkpoint["model_state_dict"])
        self.optimizer.load_state_dict(checkpoint["optimizer_state_dict"])
        self.model.to(self.device)
        logger.info(
            "Checkpoint loaded ← %s  (epoch=%d)", path, checkpoint.get("epoch", -1)
        )
        return checkpoint
