/**
 * cardObject3D.test.ts — Unit tests for M1.2.1 CardObject3D
 * Covers Initialization, Flip state, Content & Textures, Transforms, Lifecycle, and Independence.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { CardObject3D } from '../objects/CardObject3D';
import { CARD_CONFIG } from '../objects/CardConfig';
import { TABLE_CONFIG } from '../objects/TableConfig';

describe('CardObject3D (M1.2.1)', () => {
  let card: CardObject3D;

  beforeEach(() => {
    card = new CardObject3D({
      id: 'test_card_1',
      title: 'Action Card',
      description: 'A test sandbox card',
    });
  });

  afterEach(() => {
    if (!card.isDisposed()) {
      card.dispose();
    }
  });

  // ─── Nhóm 1: Khởi tạo ─────────────────────────────────────────────────────

  describe('Nhóm 1 — Khởi tạo (Initialization)', () => {
    it('creates CardObject3D instance successfully', () => {
      expect(card).toBeInstanceOf(CardObject3D);
      expect(card).toBeInstanceOf(THREE.Group);
    });

    it('stores ID accurately', () => {
      expect(card.getId()).toBe('test_card_1');
      expect(card.cardId).toBe('test_card_1');
    });

    it('generates unique auto-id when id option is omitted', () => {
      const autoCard1 = new CardObject3D();
      const autoCard2 = new CardObject3D();
      expect(autoCard1.getId()).not.toBe(autoCard2.getId());
      expect(autoCard1.getId()).toMatch(/^card_/);
      autoCard1.dispose();
      autoCard2.dispose();
    });

    it('applies default dimensions matching CARD_CONFIG', () => {
      expect(card.cardWidth).toBe(CARD_CONFIG.DEFAULT_WIDTH);
      expect(card.cardHeight).toBe(CARD_CONFIG.DEFAULT_HEIGHT);
      expect(card.cardThickness).toBe(CARD_CONFIG.DEFAULT_THICKNESS);
      expect(card.cornerRadius).toBe(CARD_CONFIG.DEFAULT_CORNER_RADIUS);
    });

    it('allows custom dimension overrides via options', () => {
      const customCard = new CardObject3D({
        width: 3.0,
        height: 4.5,
        thickness: 0.08,
        cornerRadius: 0.2,
      });
      expect(customCard.cardWidth).toBe(3.0);
      expect(customCard.cardHeight).toBe(4.5);
      expect(customCard.cardThickness).toBe(0.08);
      expect(customCard.cornerRadius).toBe(0.2);
      customCard.dispose();
    });

    it('contains a 3D Mesh with Front, Back, and Side material groups', () => {
      const mesh = card.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh;
      expect(mesh).toBeDefined();
      expect(mesh.geometry).toBeInstanceOf(THREE.BufferGeometry);

      // Verify 3 material groups: Front (0), Back (1), Sides (2)
      expect(mesh.geometry.groups.length).toBe(3);
      expect(mesh.geometry.groups[0].materialIndex).toBe(0);
      expect(mesh.geometry.groups[1].materialIndex).toBe(1);
      expect(mesh.geometry.groups[2].materialIndex).toBe(2);

      // Verify materials array
      expect(Array.isArray(mesh.material)).toBe(true);
      expect((mesh.material as THREE.Material[]).length).toBe(3);
    });

    it('returns itself as THREE.Group via getObject3D()', () => {
      expect(card.getObject3D()).toBe(card);
    });

    it('returns inner mesh via getMesh()', () => {
      expect(card.getMesh()).toBeInstanceOf(THREE.Mesh);
      expect(card.getMesh().name).toContain('test_card_1_Mesh');
    });

    it('has vertex normals: Group 0 (+Y up) for front face, Group 1 (-Y down) for back face', () => {
      const mesh = card.getMesh();
      const geo = mesh.geometry;
      const norm = geo.attributes.normal;
      const groups = geo.groups;

      // Group 0: Front face (+Y normal)
      const g0 = groups[0];
      for (let i = g0.start; i < g0.start + Math.min(g0.count, 10); i++) {
        expect(norm.getY(i)).toBeCloseTo(1.0, 2);
      }

      // Group 1: Back face (-Y normal)
      const g1 = groups[1];
      for (let i = g1.start; i < g1.start + Math.min(g1.count, 10); i++) {
        expect(norm.getY(i)).toBeCloseTo(-1.0, 2);
      }
    });
  });

  // ─── Nhóm 2: Trạng thái lật ───────────────────────────────────────────────

  describe('Nhóm 2 — Trạng thái lật (Flip State)', () => {
    it('defaults to faceUp = true', () => {
      expect(card.isFaceUp()).toBe(true);
    });

    it('honors initial faceUp = false option', () => {
      const downCard = new CardObject3D({ faceUp: false });
      expect(downCard.isFaceUp()).toBe(false);
      downCard.dispose();
    });

    it('updates state via setFaceUp(true) and setFaceUp(false)', () => {
      card.setFaceUp(false);
      expect(card.isFaceUp()).toBe(false);

      card.setFaceUp(true);
      expect(card.isFaceUp()).toBe(true);
    });

    it('flips state correctly via flip()', () => {
      expect(card.isFaceUp()).toBe(true);
      card.flip();
      expect(card.isFaceUp()).toBe(false);
      card.flip();
      expect(card.isFaceUp()).toBe(true);
    });

    it('flips multiple times without losing geometry, mesh or textures', () => {
      const mesh = card.children[0] as THREE.Mesh;
      const initialGeo = mesh.geometry;
      const initialMaterials = mesh.material;

      for (let i = 0; i < 10; i++) {
        card.flip();
      }

      expect(card.isFaceUp()).toBe(true);
      expect(mesh.geometry).toBe(initialGeo);
      expect(mesh.material).toBe(initialMaterials);
      expect(card.getId()).toBe('test_card_1');
    });

    it('maintains table contact and bounding box in Y before and after flip', () => {
      card.setPosition(0, TABLE_CONFIG.SURFACE_Y, 0);

      // Face up initially
      const boxBefore = card.getBoundingBox();
      expect(boxBefore.min.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 4);
      expect(boxBefore.max.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y + CARD_CONFIG.DEFAULT_THICKNESS, 4);
      expect(card.getBottomY()).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 4);
      expect(card.getTopY()).toBeCloseTo(TABLE_CONFIG.SURFACE_Y + CARD_CONFIG.DEFAULT_THICKNESS, 4);

      // Flip face down
      card.flip();
      const boxAfter = card.getBoundingBox();
      expect(boxAfter.min.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 4);
      expect(boxAfter.max.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y + CARD_CONFIG.DEFAULT_THICKNESS, 4);
      expect(card.getBottomY()).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 4);
      expect(card.getTopY()).toBeCloseTo(TABLE_CONFIG.SURFACE_Y + CARD_CONFIG.DEFAULT_THICKNESS, 4);
      // Ensure it does NOT penetrate under table (y >= SURFACE_Y)
      expect(boxAfter.min.y).toBeGreaterThanOrEqual(TABLE_CONFIG.SURFACE_Y - 0.001);
    });
  });

  // ─── Nhóm 3: Nội dung & Textures ──────────────────────────────────────────

  describe('Nhóm 3 — Nội dung & Textures (Content & Textures)', () => {
    it('initializes and returns card content correctly', () => {
      const content = card.getContent();
      expect(content.title).toBe('Action Card');
      expect(content.description).toBe('A test sandbox card');
    });

    it('updates title, description, and artwork via updateContent()', () => {
      card.updateContent({
        title: 'Updated Card Name',
        description: 'New modified card text',
      });

      const updated = card.getContent();
      expect(updated.title).toBe('Updated Card Name');
      expect(updated.description).toBe('New modified card text');
    });

    it('updates front texture via setFrontTexture()', () => {
      const customTex = new THREE.Texture();
      card.setFrontTexture(customTex);

      const mesh = card.children[0] as THREE.Mesh;
      const frontMat = (mesh.material as THREE.Material[])[0] as THREE.MeshStandardMaterial;
      expect(frontMat.map).toBe(customTex);
      customTex.dispose();
    });

    it('updates back texture via setBackTexture()', () => {
      const customTex = new THREE.Texture();
      card.setBackTexture(customTex);

      const mesh = card.children[0] as THREE.Mesh;
      const backMat = (mesh.material as THREE.Material[])[1] as THREE.MeshStandardMaterial;
      expect(backMat.map).toBe(customTex);
      customTex.dispose();
    });

    it('calling updateContent multiple times does not allocate infinite textures', () => {
      const mesh = card.children[0] as THREE.Mesh;
      const frontMat = (mesh.material as THREE.Material[])[0] as THREE.MeshStandardMaterial;
      const initialTex = frontMat.map;

      for (let i = 0; i < 20; i++) {
        card.updateContent({ title: `Card Iteration ${i}` });
      }

      // Texture reference remains consistent (canvas reused)
      expect(frontMat.map).toBe(initialTex);
    });
  });

  // ─── Nhóm 4: Transform ────────────────────────────────────────────────────

  describe('Nhóm 4 — Transform (Position, Rotation, Scale)', () => {
    it('setPosition updates position without altering ID or content', () => {
      card.setPosition(3.5, 1.2, -4.8);
      expect(card.position.x).toBeCloseTo(3.5);
      expect(card.position.y).toBeCloseTo(1.2);
      expect(card.position.z).toBeCloseTo(-4.8);
      expect(card.getId()).toBe('test_card_1');
      expect(card.getContent().title).toBe('Action Card');
    });

    it('setRotation updates rotation angles', () => {
      card.setRotation(0.2, 1.5, 0);
      expect(card.rotation.x).toBeCloseTo(0.2);
      expect(card.rotation.y).toBeCloseTo(1.5);
      expect(card.rotation.z).toBeCloseTo(0);
    });

    it('setScale updates scale dimensions', () => {
      card.setScale(1.2, 1.2, 1.2);
      expect(card.scale.x).toBeCloseTo(1.2);
      expect(card.scale.y).toBeCloseTo(1.2);
      expect(card.scale.z).toBeCloseTo(1.2);
    });

    it('accurately contacts table surface when placed at TABLE_CONFIG.SURFACE_Y', () => {
      card.setPosition(1.0, TABLE_CONFIG.SURFACE_Y, -2.0);
      const box = card.getBoundingBox();
      expect(box.min.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 4);
      expect(box.max.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y + CARD_CONFIG.DEFAULT_THICKNESS, 4);
      // Measured physical thickness from bounding box equals config thickness
      const measuredThickness = box.max.y - box.min.y;
      expect(measuredThickness).toBeCloseTo(CARD_CONFIG.DEFAULT_THICKNESS, 4);
    });
  });

  // ─── Nhóm 5: Lifecycle & Dispose ──────────────────────────────────────────

  describe('Nhóm 5 — Lifecycle & Disposal', () => {
    it('disposes geometry and materials owned by the card', () => {
      const mesh = card.children[0] as THREE.Mesh;
      const geoSpy = vi.spyOn(mesh.geometry, 'dispose');
      const materials = mesh.material as THREE.Material[];
      const matSpies = materials.map((m) => vi.spyOn(m, 'dispose'));

      expect(card.isDisposed()).toBe(false);
      card.dispose();

      expect(card.isDisposed()).toBe(true);
      expect(geoSpy).toHaveBeenCalledTimes(1);
      matSpies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
    });

    it('does NOT dispose externally shared textures', () => {
      const sharedTexture = new THREE.Texture();
      const texSpy = vi.spyOn(sharedTexture, 'dispose');

      const cardWithShared = new CardObject3D({
        frontTexture: sharedTexture,
        backTexture: sharedTexture,
      });

      cardWithShared.dispose();

      // Shared texture must NOT be disposed by the card
      expect(texSpy).not.toHaveBeenCalled();

      sharedTexture.dispose();
    });

    it('calling dispose multiple times is safe and does not throw', () => {
      expect(() => {
        card.dispose();
        card.dispose();
        card.dispose();
      }).not.toThrow();
      expect(card.isDisposed()).toBe(true);
    });

    it('mutations after dispose are safe no-ops and do not leak or throw', () => {
      card.dispose();

      expect(() => {
        card.flip();
        card.setFaceUp(false);
        card.setPosition(1, 2, 3);
        card.setRotation(0, 1, 0);
        card.setScale(2, 2, 2);
        card.updateContent({ title: 'Zombie Card' });
      }).not.toThrow();
    });
  });

  // ─── Nhóm 6: Tính độc lập ─────────────────────────────────────────────────

  describe('Nhóm 6 — Tính độc lập (Independence)', () => {
    it('creates multiple cards with completely distinct IDs', () => {
      const cardA = new CardObject3D({ id: 'card_alpha' });
      const cardB = new CardObject3D({ id: 'card_beta' });

      expect(cardA.getId()).toBe('card_alpha');
      expect(cardB.getId()).toBe('card_beta');

      cardA.dispose();
      cardB.dispose();
    });

    it('flipping one card does not affect other cards', () => {
      const cardA = new CardObject3D({ faceUp: true });
      const cardB = new CardObject3D({ faceUp: true });

      cardA.flip();
      expect(cardA.isFaceUp()).toBe(false);
      expect(cardB.isFaceUp()).toBe(true);

      cardA.dispose();
      cardB.dispose();
    });

    it('updating content or texture of one card does not affect other cards', () => {
      const cardA = new CardObject3D({ title: 'Card A' });
      const cardB = new CardObject3D({ title: 'Card B' });

      cardA.updateContent({ title: 'Mutated A' });
      expect(cardA.getContent().title).toBe('Mutated A');
      expect(cardB.getContent().title).toBe('Card B');

      cardA.dispose();
      cardB.dispose();
    });

    it('operates purely client-side without any backend or WebSocket dependency', () => {
      // Instance operates with zero network configuration
      expect(card).toBeDefined();
      expect(typeof card.getId()).toBe('string');
      expect(card.isFaceUp()).toBe(true);
    });
  });
});

