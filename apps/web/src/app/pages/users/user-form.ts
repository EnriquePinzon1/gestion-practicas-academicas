import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ActivatedRoute,
  Router,
} from '@angular/router';
import { ApiService } from '../../core/services/api.service';

interface UsuarioDetalle {
  id_usuario: number;
  nombres: string;
  apellidos: string;
  tipo_documento: string;
  numero_documento: string;
  correo: string;
  telefono: string | null;
  estado: string;
  rol: string;
}

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-form.html',
  styleUrl: './user-form.scss',
})
export class UserForm implements OnInit {
  idUsuario: number | null = null;

  editMode = signal(false);
  loading = signal(false);

  errorMessage = signal('');
  successMessage = signal('');

  rol = 'DOCENTE';

  nombres = '';
  apellidos = '';
  tipoDocumento = 'CC';
  numeroDocumento = '';
  correo = '';
  telefono = '';

  constructor(
    private readonly api: ApiService,
    private readonly router: Router,
    private readonly route: ActivatedRoute
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');

    if (id) {
      this.idUsuario = Number(id);
      this.editMode.set(true);
      this.loadUser();
    }
  }

  async loadUser() {
    if (!this.idUsuario) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const response = await this.api.get<{
        data: UsuarioDetalle;
      }>(`/users/${this.idUsuario}`);

      const usuario = response.data;

      this.rol = usuario.rol;
      this.nombres = usuario.nombres;
      this.apellidos = usuario.apellidos;
      this.tipoDocumento = usuario.tipo_documento;
      this.numeroDocumento = usuario.numero_documento;
      this.correo = usuario.correo;
      this.telefono = usuario.telefono ?? '';
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible consultar el usuario.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  async save() {
    this.errorMessage.set('');
    this.successMessage.set('');

    if (
      !this.nombres.trim() ||
      !this.apellidos.trim()
    ) {
      this.errorMessage.set(
        'Nombres y apellidos son obligatorios.'
      );
      return;
    }

    this.loading.set(true);

    try {
      if (this.editMode() && this.idUsuario) {
        await this.api.patch(
          `/users/${this.idUsuario}`,
          {
            nombres: this.nombres,
            apellidos: this.apellidos,
            telefono: this.telefono || null,
          }
        );

        this.successMessage.set(
          'Usuario actualizado correctamente.'
        );
      } else {
        if (
          !this.rol ||
          !this.tipoDocumento ||
          !this.numeroDocumento.trim() ||
          !this.correo.trim()
        ) {
          this.errorMessage.set(
            'Complete todos los campos obligatorios.'
          );
          return;
        }

        await this.api.post('/users', {
          rol: this.rol,
          nombres: this.nombres,
          apellidos: this.apellidos,
          tipo_documento: this.tipoDocumento,
          numero_documento: this.numeroDocumento,
          correo: this.correo,
          telefono: this.telefono || null,
        });

        this.successMessage.set(
          'Usuario registrado correctamente.'
        );
      }

      setTimeout(() => {
        this.router.navigate(['/usuarios']);
      }, 900);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible guardar el usuario.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  cancel() {
    this.router.navigate(['/usuarios']);
  }
}
